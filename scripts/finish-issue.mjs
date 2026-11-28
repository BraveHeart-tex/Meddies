import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Closes an issue (docs/tickets.md "Closing"), the counterpart to start-issue.mjs. Preflight
// writes nothing to GitHub and refuses a closed issue, an Acceptance criteria section with no
// boxes, a missing file, evidence citing no commit on freshly fetched origin/main, an
// existing-evidence comment not on this issue, or a missing Meddies Project item or Done
// option. Then it ticks the criteria, posts the evidence (or reuses the existing comment, such
// as a design approval comment), closes the issue as completed and sets Project Status to
// Done, reading each write back. A failed step stops the run and reports the verified writes
// and the remaining steps.
const OWNER = 'BraveHeart-tex'
const SCOPE_HINT = 'Run `gh auth refresh -s project` to grant the project scope.'
const USAGE = [
  'Usage: node scripts/finish-issue.mjs <n> --evidence <file> [--attach <png>...]',
  '       node scripts/finish-issue.mjs <n> --existing-evidence <comment-url>',
].join('\n')
const UPLOAD = /https:\/\/github\.com\/user-attachments\/[^\s)"']+/g
const SHA = /\b[0-9a-f]{7,40}\b/g

function run(execute, command, args) {
  try {
    return execute(command, args, {
      encoding: 'utf8',
      maxBuffer: 64 << 20,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const stderr = String(error.stderr ?? error.message ?? '').trim()
    const scope = args[0] === 'project' && /scope/i.test(stderr) ? `\n${SCOPE_HINT}` : ''
    throw new Error(`${command} ${args.slice(0, 2).join(' ')} failed: ${stderr}${scope}`)
  }
}

function parseArgs(argv) {
  const [ref, ...rest] = argv
  const options = { ref, evidence: null, existing: null, attach: [] }
  for (let i = 0; i < rest.length; i += 2) {
    const [flag, value] = [rest[i], rest[i + 1]]
    if (!value) throw new Error(USAGE)
    if (flag === '--evidence') options.evidence = value
    else if (flag === '--existing-evidence') options.existing = value
    else if (flag === '--attach') options.attach.push(value)
    else throw new Error(USAGE)
  }
  const modes = [options.evidence, options.existing].filter(Boolean).length
  if (!ref || modes !== 1 || (options.existing && options.attach.length)) throw new Error(USAGE)
  return options
}

// Ticks every "- [ ]" box in the Acceptance criteria section; every other byte is kept.
export function tickCriteria(body) {
  let inCriteria = false
  let boxes = 0
  const lines = body.split('\n').map((line) => {
    if (/^## /.test(line)) inCriteria = /^## Acceptance criteria\s*$/.test(line)
    else if (inCriteria && /^- \[[ xX]\] /.test(line)) {
      boxes += 1
      return line.replace(/^- \[ \]/, '- [x]')
    }
    return line
  })
  return { body: lines.join('\n'), boxes }
}

function findProject(gh) {
  const { projects } = gh('project', 'list', '--owner', OWNER, '--format', 'json')
  const project = projects.find((p) => p.title === 'Meddies')
  if (!project) throw new Error(`Meddies Project not found for ${OWNER}.\n${SCOPE_HINT}`)
  return { ...project, number: String(project.number) }
}

const findItem = (gh, project, url) =>
  gh(
    ...['project', 'item-list', project.number, '--owner', OWNER],
    ...['--format', 'json', '--limit', '1000'],
  ).items.find((i) => i.content?.url === url)

function preflight({ ref, evidence, existing, attach }, gh, runCommand) {
  const issue = gh('issue', 'view', ref, '--json', 'number,url,state,body,comments')
  const ticked = tickCriteria(issue.body)
  if (issue.state !== 'OPEN') throw new Error(`#${issue.number} is ${issue.state.toLowerCase()}.`)
  if (!ticked.boxes) throw new Error(`#${issue.number} has no Acceptance criteria boxes.`)

  const missing = [evidence, ...attach].filter((path) => path && !existsSync(path))
  if (missing.length) throw new Error(`Missing files: ${missing.join(', ')}.`)

  let text
  if (existing) {
    const comment = issue.comments.find((c) => c.url === existing)
    if (!comment) throw new Error(`${existing} is not a comment on #${issue.number}.`)
    text = comment.body
  } else text = readFileSync(evidence, 'utf8')

  runCommand('git', ['fetch', 'origin', 'main'])
  const onMain = (sha) => {
    try {
      runCommand('git', ['merge-base', '--is-ancestor', sha, 'origin/main'])
      return true
    } catch {
      return false
    }
  }
  const commit = [...new Set(text.match(SHA) ?? [])].find(onMain)
  if (!commit) {
    throw new Error(
      `${existing ?? evidence} cites no commit on origin/main; push first and cite its SHA.`,
    )
  }

  const project = findProject(gh)
  const { fields } = gh(
    'project',
    'field-list',
    project.number,
    '--owner',
    OWNER,
    '--format',
    'json',
  )
  const status = fields.find((field) => field.name === 'Status')
  const done = status?.options?.find((o) => o.name === 'Done')
  if (!done) throw new Error('Meddies Project has no Status option named Done.')
  const item = findItem(gh, project, issue.url)
  if (!item) {
    throw new Error(`#${issue.number} is not in the Meddies Project; run start-issue.mjs first.`)
  }
  return { issue, ticked, commit, project, status, done, item }
}

function finish(options, runCommand) {
  const gh = (...args) => JSON.parse(runCommand('gh', args))
  const { issue, ticked, commit, project, status, done, item } = preflight(options, gh, runCommand)
  const number = String(issue.number)
  const verified = []
  let comment = options.existing
  let uploads = []

  const steps = [
    [
      'tick criteria',
      () => {
        if (ticked.body !== issue.body) {
          const dir = mkdtempSync(join(tmpdir(), 'finish-issue-'))
          try {
            const bodyFile = join(dir, 'body.md')
            writeFileSync(bodyFile, ticked.body)
            runCommand('gh', ['issue', 'edit', number, '--body-file', bodyFile])
          } finally {
            rmSync(dir, { recursive: true, force: true })
          }
        }
        const body = gh('issue', 'view', number, '--json', 'body').body
        const read = tickCriteria(body)
        if (read.body !== body || read.boxes !== ticked.boxes) {
          throw new Error(`Read-back: #${number} criteria are not all ticked.`)
        }
      },
    ],
    [
      options.existing ? 'verify existing evidence' : 'post evidence',
      () => {
        if (!options.existing) {
          comment = runCommand('gh', [
            ...['issue', 'comment', number, '--body-file', options.evidence],
            ...options.attach.flatMap((file) => ['--attach', file]),
          ])
            .trim()
            .split('\n')
            .at(-1)
        }
        const read = gh('issue', 'view', number, '--json', 'comments').comments.find(
          (c) => c.url === comment,
        )
        if (!read?.body.includes(commit)) {
          throw new Error(`Read-back: evidence comment ${comment} citing ${commit} not found.`)
        }
        uploads = read.body.match(UPLOAD) ?? []
        if (uploads.length < options.attach.length) {
          throw new Error(
            `Read-back: ${options.attach.length} attachments but ${uploads.length} uploaded links in ${comment}.`,
          )
        }
      },
    ],
    [
      'close as completed',
      () => {
        runCommand('gh', ['issue', 'close', number, '--reason', 'completed'])
        const read = gh('issue', 'view', number, '--json', 'state,stateReason')
        if (read.state !== 'CLOSED' || read.stateReason !== 'COMPLETED') {
          throw new Error(`Read-back: #${number} is not closed as completed.`)
        }
      },
    ],
    [
      'set Project Status to Done',
      () => {
        runCommand('gh', [
          ...['project', 'item-edit', '--id', item.id, '--project-id', project.id],
          ...['--field-id', status.id, '--single-select-option-id', done.id],
        ])
        const read = findItem(gh, project, issue.url)?.status ?? null
        if (read !== 'Done') throw new Error(`Read-back: #${number} Project Status is ${read}.`)
      },
    ],
  ]

  for (const [index, [name, step]] of steps.entries()) {
    try {
      step()
      verified.push(name)
    } catch (error) {
      const remaining = steps.slice(index).map(([n]) => n)
      throw new Error(
        [
          `Stopped at "${name}" for ${issue.url}: ${error.message}`,
          `Verified writes: ${verified.join(', ') || 'none'}.`,
          `Remaining steps: ${remaining.join(', ')}.`,
        ].join('\n'),
      )
    }
  }

  return {
    issue: issue.url,
    commit,
    criteria: ticked.boxes,
    comment,
    uploads,
    state: 'CLOSED',
    status: 'Done',
  }
}

export function finishIssue(argv, execute = execFileSync) {
  try {
    const result = finish(parseArgs(argv), (command, args) => run(execute, command, args))
    return { status: 0, stderr: '', stdout: JSON.stringify(result, null, 2) }
  } catch (error) {
    return { status: 1, stdout: '', stderr: error.message }
  }
}

if (import.meta.main ?? process.argv[1] === fileURLToPath(import.meta.url)) {
  const { status, stdout, stderr } = finishIssue(process.argv.slice(2))
  if (status) {
    console.error(stderr)
    process.exitCode = status
  } else {
    console.log(stdout)
  }
}
