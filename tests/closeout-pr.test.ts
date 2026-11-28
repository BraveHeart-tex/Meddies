import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { closeoutPr, marker } from '../scripts/closeout-pr.mjs'

const repo = 'BraveHeart-tex/Meddies'
const prUrl = `https://github.com/${repo}/pull/7`
const issueUrl = `https://github.com/${repo}/issues/42`
const sha = '0123456789abcdef0123456789abcdef01234567'
const issueBody = [
  '## What to build',
  '',
  '- [ ] not a criterion',
  '',
  '## Acceptance criteria',
  '',
  '- [ ] One outcome - Evidence: a test',
  '- [x] Another outcome - Evidence: a capture',
].join('\n')
const prBody = (declaration = 'Complete Meddies issue: #42', evidence = '- A test passes') =>
  ['Builds the thing.', '', declaration, '', '## Evidence', '', evidence].join('\n')

type Fake = {
  merged?: boolean
  base?: string
  body?: string
  state?: string
  stateReason?: string | null
  issueBody?: string
  issueUrl?: string
  comments?: { body: string }[]
  fail?: string
}

// A stateful gh: edit, comment and close change the issue, views read it back. `fail` names a
// write (such as "issue close") that exits non-zero once, like a dropped request.
function setup(fake: Fake = {}) {
  const issue = {
    number: 42,
    url: fake.issueUrl ?? issueUrl,
    state: fake.state ?? 'OPEN',
    stateReason: fake.stateReason ?? null,
    body: fake.issueBody ?? issueBody,
    comments: fake.comments ?? [{ body: 'Started' }],
  }
  const pr = {
    number: 7,
    html_url: prUrl,
    merged: fake.merged ?? true,
    merge_commit_sha: sha,
    base: { ref: fake.base ?? 'main' },
    body: fake.body ?? prBody(),
  }
  let fail = fake.fail
  const calls: string[][] = []
  const execute = (command: string, args: string[]) => {
    calls.push([command, ...args])
    const key = args.slice(0, 2).join(' ')
    if (fail === key) {
      fail = undefined
      throw Object.assign(new Error('exit 1'), { stderr: `${key} exploded` })
    }
    const flag = (name: string) => args[args.indexOf(name) + 1]
    if (key === `api repos/${repo}/pulls/7`) return JSON.stringify(pr)
    expect(flag('--repo')).toBe(repo)
    switch (key) {
      case 'issue view':
        return JSON.stringify(issue)
      case 'issue edit':
        issue.body = readFileSync(flag('--body-file'), 'utf8')
        return ''
      case 'issue comment':
        issue.comments.push({ body: readFileSync(flag('--body-file'), 'utf8') })
        return `${issueUrl}#issuecomment-9\n`
      case 'issue close':
        issue.state = 'CLOSED'
        issue.stateReason = 'COMPLETED'
        return ''
    }
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
  }
  const replay = () => closeoutPr(['7'], execute)
  return { replay, issue, calls }
}

const writes = (calls: string[][]) =>
  calls.filter(([, a, b]) => a === 'issue' && ['edit', 'comment', 'close'].includes(b))
const closeouts = (comments: { body: string }[]) =>
  comments.filter((c) => c.body.includes(marker(7)))

function expectCompleted(issue: ReturnType<typeof setup>['issue']) {
  expect(issue.body).toContain('- [x] One outcome')
  expect(issue.body).toContain('- [ ] not a criterion')
  expect(closeouts(issue.comments)).toHaveLength(1)
  expect(closeouts(issue.comments)[0].body).toContain(`Completed by ${prUrl}, merged as ${sha}.`)
  expect(closeouts(issue.comments)[0].body).toContain(`Evidence: ${prUrl}`)
  expect([issue.state, issue.stateReason]).toEqual(['CLOSED', 'COMPLETED'])
}

test('a merged PR with a valid declaration records its SHA and evidence, ticks and closes', () => {
  const { replay, issue } = setup()
  const { status, stdout } = replay()
  expect(status).toBe(0)
  expect(JSON.parse(stdout)).toEqual({
    pr: prUrl,
    issue: issueUrl,
    sha,
    criteria: 2,
    state: 'CLOSED',
  })
  expectCompleted(issue)
})

test.each([
  ['an unmerged PR', { merged: false }, 0, 'is not merged into main'],
  ['a PR merged elsewhere', { base: 'release' }, 0, 'is not merged into main'],
  ['an ordinary reference', { body: 'Refs #42\n\n## Evidence\n\n- ok' }, 0, 'declares no'],
  ['no declaration', { body: '## Evidence\n\n- ok' }, 0, 'declares no'],
  ['a malformed declaration', { body: prBody('Complete Meddies issue #42') }, 1, 'Malformed'],
  ['a lowercase declaration', { body: prBody('complete meddies issue: #42') }, 1, 'Malformed'],
  ['a trailing word', { body: prBody('Complete Meddies issue: #42 and #43') }, 1, 'Malformed'],
  [
    'two declarations',
    { body: prBody('Complete Meddies issue: #42\nComplete Meddies issue: #43') },
    1,
    'Ambiguous',
  ],
  ['missing evidence', { body: 'Complete Meddies issue: #42' }, 1, 'no ## Evidence'],
  ['an empty evidence section', { body: prBody(undefined, '') }, 1, 'no ## Evidence'],
  ['a pull request target', { issueUrl: prUrl.replace('/7', '/42') }, 1, 'Expected an issue'],
  ['an issue without criteria', { issueBody: '## Acceptance criteria\n\nNone.' }, 1, 'no Accep'],
  [
    'an issue closed by hand',
    { state: 'CLOSED', stateReason: 'COMPLETED' },
    1,
    "without this PR's closeout",
  ],
  [
    'an issue closed as not planned',
    { state: 'CLOSED', stateReason: 'NOT_PLANNED', comments: [{ body: marker(7) }] },
    1,
    "without this PR's closeout",
  ],
])('leaves the issue untouched for %s', (_, fake, code, message) => {
  const { replay, calls } = setup(fake as Fake)
  const { status, stdout, stderr } = replay()
  expect(status).toBe(code)
  expect(stdout + stderr).toContain(message)
  expect(writes(calls)).toEqual([])
})

test.each(['issue edit', 'issue comment', 'issue close'])(
  'a replay after %s fails reaches the same completed state once',
  (step) => {
    const { replay, issue } = setup({ fail: step })
    const first = replay()
    expect(first.status).toBe(1)
    expect(first.stderr).toContain('Replay to resume.')
    expect(replay().status).toBe(0)
    expectCompleted(issue)
  },
)

test('a replay after success writes nothing and reports the completed state', () => {
  const { replay, issue, calls } = setup()
  expect(replay().status).toBe(0)
  const before = writes(calls).length
  const again = replay()
  expect(again.status).toBe(0)
  expect(JSON.parse(again.stdout).state).toBe('CLOSED')
  expect(writes(calls)).toHaveLength(before)
  expectCompleted(issue)
})
