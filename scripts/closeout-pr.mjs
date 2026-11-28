import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tickCriteria } from './finish-issue.mjs'
import { assertRepositoryIssue, repo } from './meddies-project.mjs'

// PR merge closeout (docs/tickets.md "Closing"), run by .github/workflows/closeout.yml when a PR
// merges into main and replayable by hand. A merged PR whose description holds exactly one
// `Complete Meddies issue: #<n>` line and a nonempty `## Evidence` section completes issue n:
// tick its Acceptance criteria, post one marked comment recording the merged SHA and the PR
// evidence link, close it as completed. The Meddies Project's Item closed workflow sets Done.
// An unmerged PR or one with no declaration is skipped; a malformed or repeated declaration,
// missing evidence or an ineligible issue fails. Both write nothing. The PR text is data: only
// the issue number is read from it. Every step is idempotent and read back, so a retry after a
// partial or successful run reaches the same state; a closed issue is only resumed when it was
// closed as completed and carries this PR's marked comment.
const USAGE = 'Usage: node scripts/closeout-pr.mjs <pr-number>'
const DECLARATION = /^Complete Meddies issue: #([1-9]\d*)$/
const CANDIDATE = /^\s*complete\s+meddies\s+issue\b/i

export const marker = (pr) => `<!-- meddies-closeout pr=${pr} -->`

function run(execute, command, args) {
  try {
    return execute(command, args, {
      encoding: 'utf8',
      maxBuffer: 64 << 20,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const stderr = String(error.stderr ?? error.message ?? '').trim()
    throw new Error(`${command} ${args.slice(0, 2).join(' ')} failed: ${stderr}`)
  }
}

// Returns { number } for one valid declaration, null for none, or throws.
export function readDeclaration(body) {
  const lines = (body ?? '').split(/\r?\n/).map((line) => line.trimEnd())
  const candidates = lines.filter((line) => CANDIDATE.test(line))
  if (!candidates.length) return null
  if (candidates.length > 1) {
    throw new Error(`Ambiguous: ${candidates.length} "Complete Meddies issue" lines.`)
  }
  const match = candidates[0].match(DECLARATION)
  if (!match) throw new Error('Malformed: use exactly "Complete Meddies issue: #<number>".')
  return { number: Number(match[1]) }
}

export function hasEvidence(body) {
  let inEvidence = false
  for (const line of (body ?? '').split(/\r?\n/)) {
    if (/^## /.test(line)) inEvidence = /^## Evidence\s*$/.test(line)
    else if (inEvidence && line.trim()) return true
  }
  return false
}

function closeout(ref, runCommand) {
  if (!/^[1-9]\d*$/.test(ref ?? '')) throw new Error(USAGE)
  const gh = (...args) => JSON.parse(runCommand('gh', args))
  const pr = gh('api', `repos/${repo}/pulls/${ref}`)
  if (!pr.merged || pr.base?.ref !== 'main' || !pr.merge_commit_sha) {
    return { skipped: `PR #${pr.number} is not merged into main.` }
  }
  const declaration = readDeclaration(pr.body)
  if (!declaration) return { skipped: `PR #${pr.number} declares no Meddies issue.` }
  if (!hasEvidence(pr.body)) throw new Error(`PR #${pr.number} has no ## Evidence section.`)

  const number = String(declaration.number)
  const sha = pr.merge_commit_sha
  const tag = marker(pr.number)
  const view = (fields) => gh('issue', 'view', number, '--repo', repo, '--json', fields)
  const issue = view('number,url,state,stateReason,body,comments')
  assertRepositoryIssue(issue)
  const ticked = tickCriteria(issue.body)
  if (!ticked.boxes) throw new Error(`#${number} has no Acceptance criteria boxes.`)
  const ours = (comments) => comments.find((c) => c.body.includes(tag))
  if (issue.state !== 'OPEN' && !(issue.stateReason === 'COMPLETED' && ours(issue.comments))) {
    throw new Error(`#${number} is ${issue.state.toLowerCase()} without this PR's closeout.`)
  }

  const withFile = (text, write) => {
    const dir = mkdtempSync(join(tmpdir(), 'closeout-pr-'))
    try {
      const file = join(dir, 'body.md')
      writeFileSync(file, text)
      return write(file)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const verified = []
  const steps = [
    [
      'tick criteria',
      () => {
        if (ticked.body !== issue.body) {
          withFile(ticked.body, (file) =>
            runCommand('gh', ['issue', 'edit', number, '--repo', repo, '--body-file', file]),
          )
        }
        const body = view('body').body
        if (tickCriteria(body).body !== body) {
          throw new Error(`Read-back: #${number} criteria are not all ticked.`)
        }
      },
    ],
    [
      'record closeout',
      () => {
        if (!ours(view('comments').comments)) {
          const text = [
            tag,
            `Completed by ${pr.html_url}, merged as ${sha}.`,
            '',
            `Evidence: ${pr.html_url}`,
          ].join('\n')
          withFile(text, (file) =>
            runCommand('gh', ['issue', 'comment', number, '--repo', repo, '--body-file', file]),
          )
        }
        const comments = view('comments').comments.filter((c) => c.body.includes(tag))
        if (comments.length !== 1 || !comments[0].body.includes(sha)) {
          throw new Error(`Read-back: expected one closeout comment citing ${sha} on #${number}.`)
        }
      },
    ],
    [
      'close as completed',
      () => {
        if (view('state').state === 'OPEN') {
          runCommand('gh', ['issue', 'close', number, '--repo', repo, '--reason', 'completed'])
        }
        const read = view('state,stateReason')
        if (read.state !== 'CLOSED' || read.stateReason !== 'COMPLETED') {
          throw new Error(`Read-back: #${number} is not closed as completed.`)
        }
      },
    ],
  ]
  for (const [index, [name, step]] of steps.entries()) {
    try {
      step()
      verified.push(name)
    } catch (error) {
      throw new Error(
        [
          `Stopped at "${name}" for ${issue.url}: ${error.message}`,
          `Verified: ${verified.join(', ') || 'none'}.`,
          `Remaining: ${steps
            .slice(index)
            .map(([n]) => n)
            .join(', ')}. Replay to resume.`,
        ].join('\n'),
      )
    }
  }
  return { pr: pr.html_url, issue: issue.url, sha, criteria: ticked.boxes, state: 'CLOSED' }
}

export function closeoutPr(argv, execute = execFileSync) {
  try {
    const result = closeout(argv[0], (command, args) => run(execute, command, args))
    return { status: 0, stderr: '', stdout: JSON.stringify(result, null, 2) }
  } catch (error) {
    return { status: 1, stdout: '', stderr: error.message }
  }
}

if (import.meta.main ?? process.argv[1] === fileURLToPath(import.meta.url)) {
  const { status, stdout, stderr } = closeoutPr(process.argv.slice(2))
  if (status) {
    console.error(stderr)
    process.exitCode = status
  } else {
    console.log(stdout)
  }
}
