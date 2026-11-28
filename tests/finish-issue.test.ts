import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { finishIssue } from '../scripts/finish-issue.mjs'

const url = 'https://github.com/BraveHeart-tex/Meddies/issues/42'
const pushed = 'abc1234'
const postedUrl = `${url}#issuecomment-9`
const approvalUrl = `${url}#issuecomment-5`
const body = [
  '## What to build',
  '',
  '- [ ] not a criterion',
  '',
  '## Acceptance criteria',
  '',
  '- [ ] One outcome - Evidence: a test',
  '- [x] Another outcome - Evidence: a capture',
].join('\n')

type Comment = { url: string; body: string }
type Fake = {
  state?: string
  body?: string
  comments?: Comment[]
  inProject?: boolean
  doneOption?: boolean
  dropUploads?: boolean
  fail?: string
}

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

function tempFile(name: string, text: string) {
  const dir = mkdtempSync(join(tmpdir(), 'finish-issue-test-'))
  dirs.push(dir)
  const path = join(dir, name)
  writeFileSync(path, text)
  return path
}

// A stateful gh and git: edits, comments, close and item-edit change the issue, views read it
// back. `fail` names a call (such as "issue close") that exits non-zero.
function setup(fake: Fake = {}) {
  const issue = {
    number: 42,
    url,
    state: fake.state ?? 'OPEN',
    stateReason: null as string | null,
    body: fake.body ?? body,
    comments: fake.comments ?? [{ url: `${url}#issuecomment-1`, body: 'Started' }],
  }
  let status = 'In progress'
  const calls: string[][] = []
  const execute = (command: string, args: string[]) => {
    calls.push([command, ...args])
    const key = args.slice(0, 2).join(' ')
    if (fake.fail === key) {
      throw Object.assign(new Error('exit 1'), { stderr: `${key} exploded` })
    }
    if (command === 'git') {
      if (key === 'fetch origin') return ''
      if (key === 'merge-base --is-ancestor' && args[2] === pushed) return ''
      throw Object.assign(new Error('exit 1'), { stderr: '' })
    }
    const flag = (name: string) => args[args.indexOf(name) + 1]
    switch (key) {
      case 'issue view':
        return JSON.stringify(issue)
      case 'issue edit':
        issue.body = readFileSync(flag('--body-file'), 'utf8')
        return ''
      case 'issue comment': {
        const attaches = args.filter((_, i) => args[i - 1] === '--attach')
        const links = fake.dropUploads
          ? []
          : attaches.map((_, i) => `![a](https://github.com/user-attachments/assets/${i})`)
        const text = readFileSync(flag('--body-file'), 'utf8')
        issue.comments.push({ url: postedUrl, body: [text, ...links].join('\n') })
        return `${postedUrl}\n`
      }
      case 'issue close':
        issue.state = 'CLOSED'
        issue.stateReason = 'COMPLETED'
        return ''
      case 'project list':
        return JSON.stringify({ projects: [{ number: 3, title: 'Meddies', id: 'PVT_meddies' }] })
      case 'project field-list':
        return JSON.stringify({
          fields: [
            {
              id: 'F_status',
              name: 'Status',
              options: [
                { id: 'O_progress', name: 'In progress' },
                ...(fake.doneOption === false ? [] : [{ id: 'O_done', name: 'Done' }]),
              ],
            },
          ],
        })
      case 'project item-list':
        return JSON.stringify({
          items: fake.inProject === false ? [] : [{ id: 'I_42', status, content: { url } }],
        })
      case 'project item-edit':
        status = flag('--single-select-option-id') === 'O_done' ? 'Done' : status
        return '{}'
    }
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
  }
  const finish = (...argv: string[]) => ({ ...finishIssue(['42', ...argv], execute), calls })
  return { finish, issue, calls, status: () => status }
}

const writes = (calls: string[][]) =>
  calls.filter(
    ([command, a, b]) =>
      command === 'gh' &&
      (['edit', 'comment', 'close'].includes(b) || (a === 'project' && /add|edit/.test(b))),
  )

const evidence = (text = `Commit ${pushed}, pushed to main.`) => tempFile('evidence.md', text)

test.each([
  ['a closed issue', { state: 'CLOSED' }, [], '#42 is closed.'],
  [
    'missing criteria',
    { body: '## Acceptance criteria\n\nNone yet.' },
    [],
    'no Acceptance criteria boxes',
  ],
  [
    'a missing attachment',
    {},
    ['--attach', '/nonexistent/a.png'],
    'Missing files: /nonexistent/a.png',
  ],
  ['a missing evidence file', {}, ['/nonexistent/e.md'], 'Missing files: /nonexistent/e.md'],
  ['a missing Project item', { inProject: false }, [], 'not in the Meddies Project'],
  ['a missing Done option', { doneOption: false }, [], 'no Status option named Done'],
])('refuses %s with zero GitHub writes', (_, fake, extra, message) => {
  const { finish } = setup(fake as Fake)
  const args =
    extra[0] === '/nonexistent/e.md'
      ? ['--evidence', ...extra]
      : ['--evidence', evidence(), ...extra]
  const { status, stderr, calls } = finish(...args)
  expect(status).toBe(1)
  expect(stderr).toContain(message)
  expect(writes(calls)).toEqual([])
})

test.each([
  ['no commit', 'Everything passed.'],
  ['an unreachable commit', 'Commit fedcba9, pushed to main.'],
])('refuses evidence citing %s on freshly fetched origin/main', (_, text) => {
  const { finish } = setup()
  const { status, stderr, calls } = finish('--evidence', evidence(text))
  expect(status).toBe(1)
  expect(stderr).toContain('cites no commit on origin/main')
  expect(calls.some(([c, a]) => c === 'git' && a === 'fetch')).toBe(true)
  expect(writes(calls)).toEqual([])
})

test('refuses an existing-evidence comment from another issue with zero GitHub writes', () => {
  const { finish } = setup()
  const other = 'https://github.com/BraveHeart-tex/Meddies/issues/41#issuecomment-5'
  const { status, stderr, calls } = finish('--existing-evidence', other)
  expect(status).toBe(1)
  expect(stderr).toContain('is not a comment on #42')
  expect(writes(calls)).toEqual([])
})

test('file mode ticks only the criteria, posts evidence with uploads, closes and sets Done', () => {
  const { finish, issue, status } = setup()
  const png = tempFile('frame.png', 'png')
  const result = finish('--evidence', evidence(), '--attach', png, '--attach', png)
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
  expect(issue.body).toBe(body.replace('- [ ] One outcome', '- [x] One outcome'))
  expect(issue.comments.filter((c) => c.url === postedUrl)).toHaveLength(1)
  expect(issue.state).toBe('CLOSED')
  expect(status()).toBe('Done')
  expect(JSON.parse(result.stdout)).toEqual({
    issue: url,
    commit: pushed,
    criteria: 2,
    comment: postedUrl,
    uploads: [0, 1].map((i) => `https://github.com/user-attachments/assets/${i}`),
    state: 'CLOSED',
    status: 'Done',
  })
})

test('existing-evidence mode verifies the approval comment and posts no duplicate', () => {
  const approval = {
    url: approvalUrl,
    body: `Commit ${pushed}\n![A1](https://github.com/user-attachments/assets/7)`,
  }
  const { finish, issue, status } = setup({ comments: [approval] })
  const result = finish('--existing-evidence', approvalUrl)
  expect(result.status).toBe(0)
  expect(result.calls.some(([, , b]) => b === 'comment')).toBe(false)
  expect(issue.comments).toEqual([approval])
  expect(issue.state).toBe('CLOSED')
  expect(status()).toBe('Done')
  expect(JSON.parse(result.stdout)).toMatchObject({
    comment: approvalUrl,
    uploads: ['https://github.com/user-attachments/assets/7'],
  })
})

test('a failed write reports progress and stops later writes', () => {
  const { finish, status } = setup({ fail: 'issue close' })
  const { status: exit, stderr, calls } = finish('--evidence', evidence())
  expect(exit).toBe(1)
  expect(stderr).toContain(`Stopped at "close as completed" for ${url}: gh issue close failed`)
  expect(stderr).toContain('Verified writes: tick criteria, post evidence.')
  expect(stderr).toContain('Remaining steps: close as completed, set Project Status to Done.')
  expect(calls.some(([, a, b]) => a === 'project' && b === 'item-edit')).toBe(false)
  expect(status()).toBe('In progress')
})

test('a failed read-back reports progress and stops later writes', () => {
  const { finish, calls } = setup({ dropUploads: true })
  const png = tempFile('frame.png', 'png')
  const { status, stderr } = finish('--evidence', evidence(), '--attach', png)
  expect(status).toBe(1)
  expect(stderr).toContain('1 attachments but 0 uploaded links')
  expect(stderr).toContain('Verified writes: tick criteria.')
  expect(stderr).toContain(
    'Remaining steps: post evidence, close as completed, set Project Status to Done.',
  )
  expect(calls.some(([, , b]) => b === 'close')).toBe(false)
})

test('usage errors name both modes', () => {
  const { finish } = setup()
  expect(finish().stderr).toContain('--existing-evidence <comment-url>')
  expect(finish('--evidence', 'a.md', '--existing-evidence', approvalUrl).status).toBe(1)
})
