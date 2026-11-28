import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assertRepositoryIssue, ensureProjectIssue, readProject, repo } from './meddies-project.mjs'

// Starts work on an issue (docs/tickets.md "Selecting work"): reads the issue and its
// relations, refuses a closed issue or an open blocker, then sets the issue's Meddies Project
// Status to In progress, adding it to the Project first. Field and option IDs are
// looked up by name. Prints { issue, parent, subIssues, blockedBy, base, design } as JSON.
const SCOPE_HINT = 'Run `gh auth refresh -s project` to grant the project scope.'

function run(execute, command, args) {
  try {
    return execute(command, args, {
      encoding: 'utf8',
      maxBuffer: 64 << 20,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const stderr = String(error.stderr ?? '').trim()
    const scope = /scope/i.test(stderr) ? `\n${SCOPE_HINT}` : ''
    throw new Error(`${command} ${args.slice(0, 2).join(' ')} failed: ${stderr}${scope}`)
  }
}

function refusal(issue) {
  if (issue.state !== 'OPEN') return `#${issue.number} is ${issue.state.toLowerCase()}.`
  const open = issue.blockedBy.filter((blocker) => blocker.state === 'OPEN')
  if (open.length) {
    return `#${issue.number} has open blockers: ${open.map((b) => `#${b.number}`).join(', ')}.`
  }
}

function setInProgress(issue, runCommand) {
  const gh = (...args) => JSON.parse(runCommand('gh', args))
  const project = readProject(gh)
  const status = project.status
  const option = status?.options?.find((o) => o.name === 'In progress')
  if (!option) throw new Error('Meddies Project has no Status option named In progress.')
  const item = ensureProjectIssue(gh, project, issue)
  runCommand('gh', [
    ...['project', 'item-edit', '--id', item.id, '--project-id', project.id],
    ...['--field-id', status.id, '--single-select-option-id', option.id],
  ])
}

export function startIssue(ref, execute = execFileSync) {
  const runCommand = (command, args) => run(execute, command, args)
  try {
    if (!ref) throw new Error('Usage: node scripts/start-issue.mjs <issue number or URL>')
    const raw = JSON.parse(
      runCommand('gh', [
        'issue',
        'view',
        ref,
        '--repo',
        repo,
        '--json',
        'number,title,url,body,state,comments,parent,subIssues,blockedBy',
      ]),
    )
    assertRepositoryIssue(raw)
    const relation = ({ number, state }) => ({ number, state })
    const issue = {
      ...raw,
      parent: raw.parent ? relation(raw.parent) : null,
      subIssues: (raw.subIssues?.nodes ?? []).map(relation),
      blockedBy: (raw.blockedBy?.nodes ?? []).map(relation),
    }
    const reason = refusal(issue)
    if (reason) throw new Error(`Not starting: ${reason}`)
    const base = runCommand('git', ['rev-parse', 'HEAD']).trim()
    setInProgress(issue, runCommand)
    const { number, title, url, body } = issue
    const comments = raw.comments.map((c) => ({
      author: c.author?.login ?? null,
      createdAt: c.createdAt,
      body: c.body,
    }))
    return {
      status: 0,
      stderr: '',
      stdout: JSON.stringify(
        {
          issue: { number, title, url, body, comments },
          parent: issue.parent,
          subIssues: issue.subIssues,
          blockedBy: issue.blockedBy,
          base,
          design: title.startsWith('Design:'),
        },
        null,
        2,
      ),
    }
  } catch (error) {
    return { status: 1, stdout: '', stderr: error.message }
  }
}

if (import.meta.main ?? process.argv[1] === fileURLToPath(import.meta.url)) {
  const { status, stdout, stderr } = startIssue(process.argv[2])
  if (status) {
    console.error(stderr)
    process.exitCode = status
  } else {
    console.log(stdout)
  }
}
