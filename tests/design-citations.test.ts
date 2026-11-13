import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { designFrames } from '../src/features/design-lab/frames'

// The citation rule (docs/design/README.md#citations): `NNN·X` names frame X of design #NNN.
// While design NNN has frames in the lab registry, every citation of it must be registered.
// A design without frames is archived: its citations resolve through the issue's
// "Approved design" table.

/** Deleted snapshot designs whose frames were never ported to the lab: citing them is an error. */
const DELETED_SNAPSHOT_DESIGNS = new Set(['106', '107', '108', '110', '200'])

const SCANNED = ['src', 'tests', 'docs', '.agents', 'DESIGN.md', 'PRODUCT.md', 'AGENTS.md']
const citation = /\b(\d{3})·(\$\{|[A-Z][A-Za-z0-9]*(?:·[A-Z][A-Za-z0-9]*)*)(\$\{)?/g

function citationProblems(text: string, registered: readonly string[]) {
  const designsWithFrames = new Set(registered.map((entry) => entry.split('·')[0]))
  const problems: string[] = []
  text.split('\n').forEach((line, index) => {
    for (const [cited, design, frame, template] of line.matchAll(citation)) {
      const at = `line ${index + 1}: ${cited}`
      if (frame === '${' || template)
        problems.push(`line ${index + 1}: a citation of ${design} is built from a template`)
      else if (DELETED_SNAPSHOT_DESIGNS.has(design))
        problems.push(`${at} cites a deleted snapshot design`)
      else if (designsWithFrames.has(design) && !registered.includes(cited))
        problems.push(`${at} is not a registered frame`)
    }
  })
  return problems
}

function scannedFiles(entry: string): string[] {
  const stat = fs.statSync(entry)
  if (stat.isFile()) return [entry]
  return fs
    .readdirSync(entry, { recursive: true, encoding: 'utf8' })
    .map((name) => path.join(entry, name))
    .filter((file) => fs.statSync(file).isFile())
}

test.each(designFrames.map((frame) => [frame.citation, frame] as const))(
  '%s has the slug its citation spells',
  (cited, frame) => {
    expect(frame.slug).toBe(cited.toLowerCase().replaceAll('·', '-'))
  },
)

test('slugs and citations are unique', () => {
  expect(new Set(designFrames.map((frame) => frame.slug)).size).toBe(designFrames.length)
  expect(new Set(designFrames.map((frame) => frame.citation)).size).toBe(designFrames.length)
})

test('every citation in the repository is literal and resolves', () => {
  const registered = designFrames.map((frame) => frame.citation)
  const problems = SCANNED.flatMap(scannedFiles).flatMap((file) => {
    const bytes = fs.readFileSync(file)
    if (bytes.includes(0)) return []
    return citationProblems(bytes.toString('utf8'), registered).map(
      (problem) => `${file} ${problem}`,
    )
  })
  expect(problems).toEqual([])
})

test('the citation rule flags unregistered, deleted and templated citations', () => {
  const registered = ['900·A1', '900·B·Scanner']
  expect(citationProblems('Build 900·A1 and 900·B·Scanner.', registered)).toEqual([])
  expect(citationProblems('Archived 901·A3 still resolves.', registered)).toEqual([])
  expect(citationProblems('Row:\nsee 900·A2', registered)).toEqual([
    'line 2: 900·A2 is not a registered frame',
  ])
  expect(citationProblems('see 900·B·Drawer', registered)).toEqual([
    'line 1: 900·B·Drawer is not a registered frame',
  ])
  // Split so this file's own scan doesn't read them as citations.
  expect(citationProblems('see 107·' + 'M6', registered)).toEqual([
    'line 1: 107·' + 'M6 cites a deleted snapshot design',
  ])
  for (const templated of ['900·' + '${id}', '900·A' + '${n}'])
    expect(citationProblems(templated, registered)).toEqual([
      'line 1: a citation of 900 is built from a template',
    ])
})
