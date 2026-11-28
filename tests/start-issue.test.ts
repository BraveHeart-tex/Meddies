import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { startIssue } from '../scripts/start-issue.mjs'

const script = resolve('scripts/start-issue.mjs')
const url = 'https://github.com/BraveHeart-tex/Meddies/issues/42'
const head = 'edf75b516437360fa6fabb208b88107c0a7c5f22'

type Issue = { state?: string; title?: string; blockedBy?: { number: number; state: string }[] }

function start(
  { state = 'OPEN', title = 'Add a dose', blockedBy = [] }: Issue = {},
  { inProject = true, missingScope = false } = {},
) {
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
    'project item-add': { id: 'I_added' },
    'project item-edit': {},
  }
  const calls: string[][] = []
  const execute = (command: string, args: string[]) => {
    const key = args.slice(0, 2).join(' ')
    if (command === 'git' && args.join(' ') === 'rev-parse HEAD') return head + '\n'
    if (command === 'gh') {
      calls.push(args)
      if (key === 'api graphql' && missingScope) {
        throw Object.assign(new Error('gh exited with code 1'), {
          stderr: 'error: your authentication token is missing required scopes [read:project]',
        })
      }
      if (key === 'api graphql') {
        const query = args[3]
        if (query.includes('query MeddiesProject(')) {
          expect(args).toEqual(expect.arrayContaining(['owner=BraveHeart-tex', 'number=3']))
          return JSON.stringify({
            data: {
              user: {
                projectV2: {
                  title: 'Meddies',
                  id: 'PVT_meddies',
                  status: {
                    id: 'F_status',
                    options: [{ id: 'O_progress', name: 'In progress' }],
                  },
                },
              },
            },
          })
        }
        expect(args).toEqual(expect.arrayContaining(['project=PVT_meddies', 'filter=#42']))
        return JSON.stringify({
          data: {
            node: {
              items: {
                nodes: inProject
                  ? [
                      {
                        id: 'I_existing',
                        content: {
                          number: 42,
                          repository: { nameWithOwner: 'BraveHeart-tex/Meddies' },
                        },
                      },
                    ]
                  : [],
                pageInfo: { hasNextPage: false },
              },
            },
          },
        })
      }
      if (Object.hasOwn(responses, key))
        return JSON.stringify(responses[key as keyof typeof responses])
    }
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
  }
  return { ...startIssue('42', execute), calls }
}

const projectCalls = (calls: string[][]) =>
  calls.filter(
    ([command, kind]) => command === 'project' || (command === 'api' && kind === 'graphql'),
  )
const edit = (item: string) => [
  ...['project', 'item-edit', '--id', item, '--project-id', 'PVT_meddies'],
  ...['--field-id', 'F_status', '--single-select-option-id', 'O_progress'],
]

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

test('the CLI prints usage and exits with status 1 when the issue reference is missing', () => {
  const { status, stderr } = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  expect(status).toBe(1)
  expect(stderr).toBe('Usage: node scripts/start-issue.mjs <issue number or URL>\n')
})
