import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ESLint } from 'eslint'

const eslint = new ESLint()
const built = 'src/features/design-lab/built/today-frames.tsx'

async function builtErrors(code: string, filePath = built) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages
    .filter((message) => /Built frames/.test(message.message))
    .map((message) => message.message.slice(message.message.indexOf('Built frames')))
}

test('a built frame may not import draft or approved frames', async () => {
  for (const source of [
    '../draft/frames',
    '../approved/unscheduled-model',
    '@/features/design-lab/approved/frames',
  ])
    assert.deepEqual(await builtErrors(`import { x } from '${source}'\n`), [
      'Built frames may not import draft or approved frames.',
    ])
})

test('a built frame may not import lab parts, screens or drawers', async () => {
  for (const source of ['./today-parts', '../history-screens', '@/features/design-lab/x-drawers'])
    assert.deepEqual(await builtErrors(`import { X } from '${source}'\n`), [
      'Built frames may not import lab parts, screens or drawers.',
    ])
})

test('a built frame may import production code, fixtures and models', async () => {
  for (const source of [
    '@/features/schedules/interval-setup-parts',
    '@/components/ui/button',
    '@/components/layout/app-shell',
    '../lab-fixtures',
    './today-model',
  ])
    assert.deepEqual(await builtErrors(`import { X } from '${source}'\n`), [])
})

test('the browser import rules still apply to built frames', async () => {
  const [result] = await eslint.lintText("import { x } from '@/features/medicines/server'\n", {
    filePath: built,
  })
  assert.equal(result.messages.filter((m) => m.ruleId === 'no-restricted-imports').length, 1)
})

test('a built frame may not style lowercase elements', async () => {
  assert.deepEqual(await builtErrors('export const F = () => <div className="p-4" />\n'), [
    'Built frames take styling from production components, not className.',
  ])
  assert.deepEqual(
    await builtErrors(
      'import { Button } from \'@/components/ui/button\'\nexport const F = () => <Button className="w-full" />\n',
    ),
    [],
  )
})

test('approved frames keep their own styling and parts', async () => {
  const approved = 'src/features/design-lab/approved/today-frames.tsx'
  assert.deepEqual(
    await builtErrors(
      'import { X } from \'./today-parts\'\nexport const F = () => <div className="p-4" />\n',
      approved,
    ),
    [],
  )
})
