import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'

const template = '.agents/skills/design-ticket/templates/comparison.html'
const frames = [
  { slug: '900-a1', citation: '900·A1', title: 'First screen' },
  { slug: '900-a2', citation: '900·A2', title: 'Next screen' },
  { slug: '900-b1', citation: '900·B1', title: 'Second & screen' },
  { slug: '900-c1', citation: '900·C1', title: 'Third screen' },
  { slug: '900-s1', citation: '900·S1', title: 'Shared screen' },
]
const spec = {
  title: "Bora's comparison",
  directions: {
    A: {
      name: 'First',
      pitch: 'First pitch',
      facts: { Screens: 'Two' },
      tradeOffs: { Cost: 'More steps' },
    },
    B: {
      name: 'Second',
      pitch: 'Second pitch',
      facts: { Screens: 'One' },
      tradeOffs: { Benefit: 'Fewer steps' },
    },
    C: { name: 'Third', pitch: 'Third pitch', facts: {}, tradeOffs: {} },
  },
  recommendation: { direction: 'B', reasons: ['It takes fewer steps.'] },
  decisions: ['Keep the shared state.'],
  openQuestions: ['Which title should the build use?'],
  buildTicket: 901,
}
let root: string

function registry(status: 'draft' | 'approved', selected = frames) {
  const entries = selected
    .map((frame) => ({ ...frame, status }))
    .concat({
      slug: '901-a1',
      citation: '901·A1',
      title: 'Other design',
      status,
    })
  writeFileSync(
    join(root, 'src/features/design-lab/frames.tsx'),
    `export const designFrames = [
      ...${JSON.stringify(entries)},
      { slug: '900-z1', citation: '900·Z1', title: 'Built screen', status: 'built' },
    ]`,
  )
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'meddies-lab-compare-'))
  for (const dir of [
    'scripts',
    'src/features/design-lab',
    'captures',
    '.agents/skills/design-ticket/templates',
  ]) {
    mkdirSync(join(root, dir), { recursive: true })
  }
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'junction')
  copyFileSync('scripts/lab-compare.mjs', join(root, 'scripts/lab-compare.mjs'))
  copyFileSync(template, join(root, template))
  registry('draft')
  writeFileSync(join(root, 'spec.json'), JSON.stringify(spec))
  for (const { slug } of frames) {
    writeFileSync(join(root, 'captures', `${slug}-402x874.png`), 'capture')
  }
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

function compare(...extra: string[]) {
  return spawnSync(
    process.execPath,
    ['scripts/lab-compare.mjs', '900', '--spec', 'spec.json', '--captures', 'captures', ...extra],
    { cwd: root, encoding: 'utf8' },
  )
}

test('the draft comparison lists all registered directions and shared frames with inline captures', () => {
  const { status, stdout, stderr } = compare()
  expect(status, stderr).toBe(0)
  for (const { slug, citation } of frames) {
    expect(stdout).toContain(slug)
    expect(stdout).toContain(citation)
  }
  expect(stdout.match(/data:image\/png;base64,Y2FwdHVyZQ==/g)).toHaveLength(5)
  expect(stdout).toContain('Second &amp; screen')
  expect(stdout).toContain('It takes fewer steps.')
  expect(stdout).toContain('Fewer steps')
  expect(stdout).toContain('Which title should the build use?')
  expect(stdout.indexOf('Direction B</p>')).toBeLessThan(stdout.indexOf('Direction A</p>'))
  expect(stdout).not.toMatch(/901·A1|900·Z1|\{\{|<!--/)
})

test('capture and placeholder failures name the problem and write no page', () => {
  const capture = join(root, 'captures', '900-a2-402x874.png')
  rmSync(capture)
  const missing = compare()
  expect(missing.status).toBe(1)
  expect(missing.stderr).toContain('Missing capture for 900·A2')
  expect(missing.stderr).toContain('900-a2-402x874.png')
  expect(missing.stdout).toBe('')

  writeFileSync(capture, '')
  const empty = compare()
  expect(empty.status).toBe(1)
  expect(empty.stderr).toContain('Empty capture for 900·A2')
  expect(empty.stdout).toBe('')

  writeFileSync(capture, 'capture')
  appendFileSync(join(root, template), '{{TODO}}')
  const placeholder = compare()
  expect(placeholder.status).toBe(1)
  expect(placeholder.stderr).toContain('{{TODO}}')
  expect(placeholder.stdout).toBe('')
})

test('the approved record keeps only the chosen direction and shared frames before and after the move', () => {
  // The original recommendation was B. Missing captures for losers cannot block A's record.
  for (const slug of ['900-b1', '900-c1']) {
    rmSync(join(root, 'captures', `${slug}-402x874.png`))
  }
  for (const status of ['draft', 'approved'] as const) {
    if (status === 'approved') registry(status, [frames[0], frames[1], frames[4]])
    const result = compare('--approved', 'A')
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Approved')
    for (const citation of ['900·A1', '900·A2', '900·S1']) {
      expect(result.stdout).toContain(citation)
    }
    expect(result.stdout).toContain('Decisions')
    expect(result.stdout).toContain('Keep the shared state.')
    expect(result.stdout).toContain('Still open for #901')
    expect(result.stdout).toContain('Which title should the build use?')
    expect(result.stdout).not.toMatch(/900·[BC]1|Recommended|It takes fewer steps\.|>Decide</)
  }
  const remaining = compare()
  expect(remaining.status, remaining.stderr).toBe(0)
  expect(remaining.stdout).toContain('900·A1')
  expect(remaining.stdout).toContain('900·S1')
})
