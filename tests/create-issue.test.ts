import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, expect, test } from 'vitest'

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
const fake = `#!/usr/bin/env node
const fs = require('node:fs')
const a = process.argv.slice(2)
const path = process.env.FAKE_STATE
const s = JSON.parse(fs.readFileSync(path, 'utf8'))
s.calls.push(a)
const value = (key) => a[a.indexOf(key) + 1]
let out = {}
let failure = false
if (s.failAt === a.slice(0,2).join(' ')) { process.stderr.write('injected failure'); process.exit(1) }
const key = a.slice(0, 2).join(' ')
if (key === 'project list') out = {projects:[{title:'Meddies',id:'P',number:3}]}
else if (key === 'project field-list') out = {fields:[
 {name:'Status',id:'S',options:[{name:'Backlog',id:'B'}]},
 {name:'Priority',id:'F',options:['Urgent','High','Medium','Low'].map(name => ({name,id:name}))}]}
else if (key === 'issue create') {
 s.creates++
 s.issue = {number:42,url:'https://github.com/BraveHeart-tex/Meddies/issues/42',title:value('--title'),body:fs.readFileSync(value('--body-file'),'utf8'),labels:a.flatMap((x,i) => x === '--label' ? [{name:a[i+1]}] : []),parent:null,blockedBy:{nodes:[]}}
 out = s.issue.url
}
else if (key === 'issue view') out = {...s.issue, ...(s.mismatch === 'body' ? {body:'changed'} : {}), ...(s.mismatch === 'labels' ? {labels:[]} : {}), ...(s.mismatch === 'title' ? {title:'changed'} : {}), ...(s.mismatch === 'relationships' ? {parent:{number:999}} : {})}
else if (key === 'project item-add') out = {id:'I'}
else if (key === 'project item-edit') {
 if (s.fail) failure = true
 else s.fields[value('--field-id')] = value('--single-select-option-id')
}
else if (key === 'api graphql') out = {data:{node:{fieldValues:{nodes:s.mismatch === 'fields' ? [] : Object.entries(s.fields).map(([key,name]) => ({name:name === 'B' ? 'Backlog':name,field:{name:key === 'S' ? 'Status':'Priority'}}))}}}}
else if (a[0] === 'api') {
 const endpoint = a.find(x => x.startsWith('repos/'))
 if (a.includes('POST')) {
  if (endpoint.endsWith('/sub_issues')) s.issue.parent = {number:Number(endpoint.split('/').at(-2))}
  else s.issue.blockedBy.nodes.push({number:Number(value('-F').split('=').at(-1)) - 1000})
 } else out = {id:1000 + Number(endpoint.split('/').at(-1))}
} else failure = true
fs.writeFileSync(path,JSON.stringify(s))
if (failure) { process.stderr.write('injected denial'); process.exit(1) }
process.stdout.write(typeof out === 'string' ? out + '\\n' : JSON.stringify(out))
`
function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'create-issue-'))
  dirs.push(dir)
  const statePath = join(dir, 'state.json')
  const bodyPath = join(dir, 'body.md')
  const body = '  Exact body\r\n\nUnicode: İ 💊\n'
  writeFileSync(bodyPath, body)
  writeFileSync(join(dir, 'gh'), fake)
  chmodSync(join(dir, 'gh'), 0o755)
  writeFileSync(statePath, JSON.stringify({ calls: [], creates: 0, fields: {} }))
  const state = () => JSON.parse(readFileSync(statePath, 'utf8'))
  const patch = (value: object) =>
    writeFileSync(statePath, JSON.stringify({ ...state(), ...value }))
  const invoke = (extra: string[] = [], defaults = true) =>
    spawnSync(
      process.execPath,
      [
        'scripts/create-issue.mjs',
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
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}${delimiter}${process.env.PATH}`,
          NODE_NO_WARNINGS: '1',
          FAKE_STATE: statePath,
        },
      },
    )
  return { state, patch, invoke, body, bodyPath }
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
  expect(h.state().issue.body).toBe(h.body)
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
