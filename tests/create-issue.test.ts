import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { createIssue } from '../scripts/create-issue.mjs'

test('rejects missing required inputs before calling GitHub', () => {
  const result = spawnSync(process.execPath, ['scripts/create-issue.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: '/nonexistent' },
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('--title')
})

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
type SavedIssue = {
  number: number
  url: string
  title: string
  body: string
  labels: { name: string }[]
  parent: { number: number } | null
  blockedBy: { nodes: { number: number }[] }
}

type FakeState = {
  calls: string[][]
  creates: number
  fields: Record<string, string>
  issue?: SavedIssue
  fail?: boolean
  failAt?: string | null
  mismatch?: string
}

function fakeGh(state: FakeState, args: string[]): unknown {
  state.calls.push(args)
  const command = args.slice(0, 2).join(' ')
  const value = (key: string) => args[args.indexOf(key) + 1]
  if (state.failAt === command) throw new Error('injected failure')

  switch (command) {
    case 'project list':
      return { projects: [{ title: 'Meddies', id: 'P', number: 3 }] }
    case 'project field-list':
      return {
        fields: [
          { name: 'Status', id: 'S', options: [{ name: 'Backlog', id: 'B' }] },
          {
            name: 'Priority',
            id: 'F',
            options: ['Urgent', 'High', 'Medium', 'Low'].map((name) => ({ name, id: name })),
          },
        ],
      }
    case 'issue create':
      state.creates++
      state.issue = {
        number: 42,
        url: 'https://github.com/BraveHeart-tex/Meddies/issues/42',
        title: value('--title'),
        body: readFileSync(value('--body-file'), 'utf8'),
        labels: args.flatMap((arg, i) => (arg === '--label' ? [{ name: args[i + 1] }] : [])),
        parent: null,
        blockedBy: { nodes: [] },
      }
      return state.issue.url
    case 'issue view':
      return {
        ...state.issue,
        ...(state.mismatch === 'body' ? { body: 'changed' } : {}),
        ...(state.mismatch === 'labels' ? { labels: [] } : {}),
        ...(state.mismatch === 'title' ? { title: 'changed' } : {}),
        ...(state.mismatch === 'relationships' ? { parent: { number: 999 } } : {}),
      }
    case 'project item-add':
      return { id: 'I' }
    case 'project item-edit':
      if (state.fail) throw new Error('injected denial')
      state.fields[value('--field-id')] = value('--single-select-option-id')
      return {}
    case 'api graphql': {
      const nodes =
        state.mismatch === 'fields'
          ? []
          : Object.entries(state.fields).map(([key, name]) => ({
              name: name === 'B' ? 'Backlog' : name,
              field: { name: key === 'S' ? 'Status' : 'Priority' },
            }))
      return { data: { node: { fieldValues: { nodes } } } }
    }
    case 'api --method': {
      const endpoint = value('POST')
      if (!state.issue) throw new Error('Missing fake issue')
      if (endpoint.endsWith('/sub_issues')) {
        state.issue.parent = { number: Number(endpoint.split('/').at(-2)) }
      } else {
        state.issue.blockedBy.nodes.push({ number: Number(value('-F').split('=').at(-1)) - 1000 })
      }
      return {}
    }
    default:
      if (args[0] === 'api') return { id: 1000 + Number(args[1].split('/').at(-1)) }
      throw new Error('injected denial')
  }
}

const validTicket = [
  '## What to build',
  'Log a dose.',
  '## Ownership',
  '- Owns: the log command',
  '- Out of scope: export (#55)',
  '## Size',
  'Migrations 0 · New screens 0 · Owned frames 0 · Journeys 0 · Proofs 1',
  '## Acceptance criteria',
  '- [ ] A log saves - Evidence: real-D1 test',
  '',
].join('\n')

function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'create-issue-'))
  dirs.push(dir)
  const bodyPath = join(dir, 'body.md')
  const body = `  Exact body\r\n\nUnicode: İ 💊\n${validTicket}`
  writeFileSync(bodyPath, body)
  const state: FakeState = { calls: [], creates: 0, fields: {} }
  const patch = (value: Partial<FakeState>) => Object.assign(state, value)
  const invoke = (extra: string[] = [], defaults = true) =>
    createIssue(
      [
        ...(defaults
          ? [
              '--title',
              'A ticket',
              '--body-file',
              bodyPath,
              '--category',
              'enhancement',
              '--areas',
              'frontend',
              '--priority',
              'High',
            ].filter((_, i, all) => !extra.includes(all[i - (i % 2)]))
          : []),
        ...extra,
      ],
      (...args) => {
        const result = fakeGh(state, args)
        return typeof result === 'string' ? result + '\n' : JSON.stringify(result)
      },
    )
  return { state: () => state, patch, invoke, body, bodyPath }
}

test('creates once, preserves exact body and verifies relationships and Project fields', () => {
  const h = harness()
  const result = h.invoke(['--parent', '7', '--blocked-by', '8,9'])
  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).toBe('')
  expect(JSON.parse(result.stdout)).toEqual({
    number: 42,
    url: 'https://github.com/BraveHeart-tex/Meddies/issues/42',
    status: 'Backlog',
    priority: 'High',
    labels: ['enhancement', 'frontend', 'needs-triage'],
    relationships: { verified: true, parent: 7, blockedBy: [8, 9] },
  })
  expect(h.state().creates).toBe(1)
  expect(h.state().issue?.body).toBe(h.body)
  expect(h.state().fields).toEqual({ S: 'B', F: 'High' })
})

test.each([
  ['--category', 'other'],
  ['--areas', 'frontend,other'],
  ['--areas', 'frontend,frontend'],
  ['--triage-state', 'other'],
  ['--triage-state', 'ready-for-agent'],
  ['--priority', 'Critical'],
  ['--parent-ticket'],
  ['--parent', '0'],
  ['--blocked-by', '8,8'],
  ['--blocked-by', '-1'],
  ['--resume', 'https://example.com/42'],
  ['--milestone', 'unused'],
  ['--title'],
])('invalid inputs cause no GitHub calls: %j', (...extra) => {
  const h = harness()
  const result = h.invoke(extra)
  expect(result.status).toBe(1)
  expect(h.state().calls).toEqual([])
})

test.each(['needs-triage', 'needs-info', 'ready-for-agent', 'ready-for-human', 'wontfix'])(
  'verifies the explicit triage state %s',
  (state) => {
    const h = harness()
    const result = h.invoke([
      '--triage-state',
      state,
      ...(state === 'ready-for-agent' ? ['--approved-breakdown'] : []),
    ])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).labels).toContain(state)
  },
)

test.each(['Urgent', 'High', 'Medium', 'Low'])('configures Priority %s', (priority) => {
  const h = harness()
  const result = h.invoke(
    [
      '--title',
      'A ticket',
      '--body-file',
      h.bodyPath,
      '--category',
      'bug',
      '--areas',
      'backend,frontend',
      '--priority',
      priority,
    ],
    false,
  )
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({
    priority,
    labels: ['bug', 'backend', 'frontend', 'needs-triage'],
  })
  expect(h.state().fields.F).toBe(priority)
})

test('parent-ticket mode omits Priority and permits a native parent', () => {
  const h = harness()
  const result = h.invoke(
    [
      '--title',
      'A ticket',
      '--body-file',
      h.bodyPath,
      '--category',
      'bug',
      '--areas',
      'backend',
      '--parent-ticket',
      '--parent',
      '7',
    ],
    false,
  )
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).not.toHaveProperty('priority')
  expect(h.state().fields).toEqual({ S: 'B' })
})

test('partial failure identifies the existing issue and resumes without duplicate creation or relationships', () => {
  const h = harness()
  h.patch({ fail: true })
  const failed = h.invoke(['--parent', '7', '--blocked-by', '8'])
  expect(failed.status).toBe(1)
  expect(JSON.parse(failed.stderr)).toMatchObject({
    url: 'https://github.com/BraveHeart-tex/Meddies/issues/42',
    unfinished: ['Project fields', 'verify'],
  })
  expect(failed.stderr).toContain('injected denial')
  expect(failed.stderr).toContain('--resume 42')
  h.patch({ fail: false })
  const resumed = h.invoke(['--parent', '7', '--blocked-by', '8', '--resume', '42'])
  expect(resumed.status, resumed.stderr).toBe(0)
  expect(h.state().creates).toBe(1)
  expect(h.state().calls.filter((a: string[]) => a.includes('POST'))).toHaveLength(2)
})

test.each(['title', 'body', 'labels', 'relationships', 'fields'])(
  'read-back mismatch fails explicitly: %s',
  (mismatch) => {
    const h = harness()
    h.patch({ mismatch })
    const result = h.invoke()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Read-back mismatch')
    expect(result.stderr).toContain('https://github.com/BraveHeart-tex/Meddies/issues/42')
  },
)

test.each(['issue view', 'api --method', 'project item-add'])(
  'failure at %s retains recovery identity',
  (failAt) => {
    const h = harness()
    h.patch({ failAt })
    const failed = h.invoke(['--parent', '7'])
    expect(failed.status).toBe(1)
    expect(failed.stderr).toContain('--resume 42')
    h.patch({ failAt: null })
    const resumed = h.invoke(['--parent', '7', '--resume', '42'])
    expect(resumed.status, resumed.stderr).toBe(0)
    expect(h.state().creates).toBe(1)
  },
)

test('resume refuses changed content before any writes', () => {
  const h = harness()
  expect(h.invoke().status).toBe(0)
  h.patch({ calls: [] })
  const result = h.invoke(['--title', 'Different', '--resume', '42'])
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Read-back mismatch')
  expect(
    h
      .state()
      .calls.some((a: string[]) => ['create', 'item-add', 'item-edit', '--method'].includes(a[1])),
  ).toBe(false)
})

test.each(['--parent', '--blocked-by', '--resume'])(
  'rejects empty optional numeric input %s',
  (flag) => {
    const h = harness()
    const result = h.invoke([flag, ''])
    expect(result.status).toBe(1)
    expect(h.state().calls).toEqual([])
  },
)

test('resume diagnostics retain identity even when metadata discovery fails', () => {
  const h = harness()
  expect(h.invoke().status).toBe(0)
  h.patch({ failAt: 'project list' })
  const result = h.invoke(['--resume', '42'])
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('https://github.com/BraveHeart-tex/Meddies/issues/42')
})

test('non-parent tickets require Priority before any GitHub call', () => {
  const h = harness()
  const result = h.invoke(
    ['--title', 'Ticket', '--body-file', h.bodyPath, '--category', 'bug', '--areas', 'backend'],
    false,
  )
  expect(result.status).toBe(1)
  expect(h.state().calls).toEqual([])
})

test('non-parent ticket bodies fail the ticket rules before any GitHub call', () => {
  const h = harness()
  writeFileSync(h.bodyPath, 'No sections\n')
  const result = h.invoke(
    [
      '--title',
      'Ticket',
      '--body-file',
      h.bodyPath,
      '--category',
      'bug',
      '--areas',
      'backend',
      '--priority',
      'High',
    ],
    false,
  )
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Missing section: ## Size')
  expect(h.state().calls).toEqual([])
})
