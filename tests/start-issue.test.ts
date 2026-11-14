import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, expect, test } from 'vitest'

const script = resolve('scripts/start-issue.mjs')
const directories: string[] = []
const url = 'https://github.com/BraveHeart-tex/Meddies/issues/42'

// A fake `gh` first on PATH: answers from a fixture and logs every call, so the script runs
// end to end without touching the real board.
const fakeGh = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs')
const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n')
const fixture = JSON.parse(readFileSync(process.env.FAKE_GH_FIXTURE, 'utf8'))
if (args[0] === 'project' && fixture.missingScope) {
  process.stderr.write('error: your authentication token is missing required scopes [read:project]')
  process.exit(1)
}
const key = args.slice(0, 2).join(' ')
if (!(key in fixture.responses)) process.exit(1)
process.stdout.write(JSON.stringify(fixture.responses[key]))
`

type Issue = { state?: string; title?: string; blockedBy?: { number: number; state: string }[] }

function start(
  { state = 'OPEN', title = 'Add a dose', blockedBy = [] }: Issue = {},
  { inProject = true, missingScope = false } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'start-issue-'))
  directories.push(dir)
  writeFileSync(join(dir, 'gh'), fakeGh)
  chmodSync(join(dir, 'gh'), 0o755)
  const log = join(dir, 'calls.log')
  writeFileSync(log, '')
  const responses = {
    'issue view': {
      number: 42,
      title,
      url,
      body: 'What to build',
      state,
      comments: [{ author: { login: 'ana' }, createdAt: '2026-11-14T00:00:00Z', body: 'Brief' }],
      parent: { number: 7, state: 'OPEN', title: 'Parent' },
      subIssues: { nodes: [{ number: 43, state: 'CLOSED' }] },
      blockedBy: { nodes: blockedBy },
    },
    'project list': {
      projects: [
        { number: 1, title: 'Other', id: 'PVT_other' },
        { number: 3, title: 'Meddies', id: 'PVT_meddies' },
      ],
    },
    'project field-list': {
      fields: [
        { id: 'F_priority', name: 'Priority', options: [{ id: 'O_high', name: 'In progress' }] },
        {
          id: 'F_status',
          name: 'Status',
          options: [
            { id: 'O_todo', name: 'To Do' },
            { id: 'O_progress', name: 'In progress' },
          ],
        },
      ],
    },
    'project item-list': {
      items: [
        { id: 'I_other', content: { url: url.replace('42', '41') } },
        ...(inProject ? [{ id: 'I_existing', content: { url } }] : []),
      ],
    },
    'project item-add': { id: 'I_added' },
    'project item-edit': {},
  }
  const fixture = join(dir, 'fixture.json')
  writeFileSync(fixture, JSON.stringify({ responses, missingScope }))
  const result = spawnSync(process.execPath, [script, '42'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}${delimiter}${process.env.PATH}`,
      FAKE_GH_LOG: log,
      FAKE_GH_FIXTURE: fixture,
    },
  })
  const calls = readFileSync(log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[])
  return { ...result, calls }
}

const projectCalls = (calls: string[][]) => calls.filter((args) => args[0] === 'project')
const edit = (item: string) => [
  ...['project', 'item-edit', '--id', item, '--project-id', 'PVT_meddies'],
  ...['--field-id', 'F_status', '--single-select-option-id', 'O_progress'],
]

afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true })))

test('refuses a closed issue without touching the Project', () => {
  const { status, stderr, calls } = start({ state: 'CLOSED' })
  expect(status).not.toBe(0)
  expect(stderr).toContain('#42 is closed')
  expect(projectCalls(calls)).toEqual([])
})

test('refuses an issue with an open blocker and names the open blockers', () => {
  const { status, stderr, calls } = start({
    blockedBy: [
      { number: 10, state: 'CLOSED' },
      { number: 11, state: 'OPEN' },
    ],
  })
  expect(status).not.toBe(0)
  expect(stderr).toContain('open blockers: #11.')
  expect(projectCalls(calls)).toEqual([])
})

test('sets an issue already in the Project to In progress, with IDs found by name', () => {
  const { status, calls } = start()
  expect(status).toBe(0)
  expect(calls.some((args) => args[1] === 'item-add')).toBe(false)
  expect(calls.at(-1)).toEqual(edit('I_existing'))
})

test('adds an issue missing from the Project, then sets it to In progress', () => {
  const { status, calls } = start({}, { inProject: false })
  expect(status).toBe(0)
  const add = calls.findIndex((args) => args[1] === 'item-add')
  expect(calls[add]).toEqual(expect.arrayContaining(['3', '--url', url]))
  expect(calls.slice(add + 1)).toEqual([edit('I_added')])
})

test('prints the issue, its relations, the base commit and the design flag', () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  expect(JSON.parse(start().stdout)).toEqual({
    issue: {
      number: 42,
      title: 'Add a dose',
      url,
      body: 'What to build',
      comments: [{ author: 'ana', createdAt: '2026-11-14T00:00:00Z', body: 'Brief' }],
    },
    parent: { number: 7, state: 'OPEN' },
    subIssues: [{ number: 43, state: 'CLOSED' }],
    blockedBy: [],
    base: head,
    design: false,
  })
  expect(JSON.parse(start({ title: 'Design: History' }).stdout).design).toBe(true)
})

test('a missing project scope tells the user how to grant it', () => {
  const { status, stderr } = start({}, { missingScope: true })
  expect(status).not.toBe(0)
  expect(stderr).toContain('gh auth refresh -s project')
})
