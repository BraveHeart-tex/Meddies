import { execFileSync } from 'node:child_process'

// Starts work on an issue (docs/tickets.md "Selecting work"): reads the issue and its
// relations, refuses a closed issue or an open blocker, then sets the issue's Meddies Project
// Status to In progress, adding it to the Project first. Project, field and option IDs are
// looked up by name. Prints { issue, parent, subIssues, blockedBy, base, design } as JSON.
const OWNER = 'BraveHeart-tex'
const SCOPE_HINT = 'Run `gh auth refresh -s project` to grant the project scope.'

function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      maxBuffer: 64 << 20,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const stderr = String(error.stderr ?? '').trim()
    const scope = args[0] === 'project' && /scope/i.test(stderr) ? `\n${SCOPE_HINT}` : ''
    throw new Error(`${command} ${args.slice(0, 2).join(' ')} failed: ${stderr}${scope}`)
  }
}
const gh = (...args) => JSON.parse(run('gh', args))

function refusal(issue) {
  if (issue.state !== 'OPEN') return `#${issue.number} is ${issue.state.toLowerCase()}.`
  const open = issue.blockedBy.filter((blocker) => blocker.state === 'OPEN')
  if (open.length) {
    return `#${issue.number} has open blockers: ${open.map((b) => `#${b.number}`).join(', ')}.`
  }
}

function setInProgress(issue) {
  const { projects } = gh('project', 'list', '--owner', OWNER, '--format', 'json')
  const project = projects.find((p) => p.title === 'Meddies')
  if (!project) throw new Error(`Meddies Project not found for ${OWNER}.\n${SCOPE_HINT}`)
  const number = String(project.number)
  const { fields } = gh('project', 'field-list', number, '--owner', OWNER, '--format', 'json')
  const status = fields.find((field) => field.name === 'Status')
  const option = status?.options?.find((o) => o.name === 'In progress')
  if (!option) throw new Error('Meddies Project has no Status option named In progress.')
  const { items } = gh(
    'project',
    'item-list',
    number,
    '--owner',
    OWNER,
    '--format',
    'json',
    '--limit',
    '1000',
  )
  const item =
    items.find((i) => i.content?.url === issue.url) ??
    gh('project', 'item-add', number, '--owner', OWNER, '--url', issue.url, '--format', 'json')
  run('gh', [
    ...['project', 'item-edit', '--id', item.id, '--project-id', project.id],
    ...['--field-id', status.id, '--single-select-option-id', option.id],
  ])
}

const ref = process.argv[2]
try {
  if (!ref) throw new Error('Usage: node scripts/start-issue.mjs <issue number or URL>')
  const raw = gh(
    'issue',
    'view',
    ref,
    '--json',
    'number,title,url,body,state,comments,parent,subIssues,blockedBy',
  )
  const relation = ({ number, state }) => ({ number, state })
  const issue = {
    ...raw,
    parent: raw.parent ? relation(raw.parent) : null,
    subIssues: (raw.subIssues?.nodes ?? []).map(relation),
    blockedBy: (raw.blockedBy?.nodes ?? []).map(relation),
  }
  const reason = refusal(issue)
  if (reason) throw new Error(`Not starting: ${reason}`)
  const base = run('git', ['rev-parse', 'HEAD']).trim()
  setInProgress(issue)
  const { number, title, url, body } = issue
  const comments = raw.comments.map((c) => ({
    author: c.author?.login ?? null,
    createdAt: c.createdAt,
    body: c.body,
  }))
  console.log(
    JSON.stringify(
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
  )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
