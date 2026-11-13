import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ESLint } from 'eslint'

const eslint = new ESLint()

async function classErrors(code: string, filePath = 'tests/x.test.tsx') {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter(
    (message) => message.ruleId === 'meddies/no-cosmetic-class-assertions',
  ).length
}

test('a styling utility class assertion in a component test fails', async () => {
  for (const assertion of [
    `expect(el).toHaveClass('bg-primary')`,
    `expect(el).not.toHaveClass('bg-primary')`,
    `expect(el).toHaveClass('border')`,
    `expect(el).toHaveClass('col-span-full')`,
    `expect(el).toHaveClass('text-destructive')`,
    `expect(el).toHaveClass('px-4')`,
    `expect(el).toHaveClass('md:hidden')`,
    `expect(el).toHaveClass('data-[state=open]:bg-accent')`,
    `expect(el).toHaveClass('-mt-2')`,
    `expect(el).toHaveClass('lucide-pill', 'rounded-md')`,
    'expect(el).toHaveClass(`flex gap-2`)',
    `expect(el).toHaveClass('w-full', { exact: true })`,
  ])
    assert.equal(await classErrors(`${assertion}\n`), 1, assertion)
})

test('a class that is not a styling utility passes', async () => {
  for (const assertion of [
    `expect(el).toHaveClass('lucide-pill')`,
    `expect(el).toHaveClass('is-selected')`,
    `expect(el).toHaveClass(className)`,
    `expect(el).toHaveAttribute('data-state', 'open')`,
  ])
    assert.equal(await classErrors(`${assertion}\n`), 0, assertion)
})

test('the rule covers component tests only', async () => {
  const code = `expect(el).toHaveClass('bg-primary')\n`
  assert.equal(await classErrors(code, 'tests/x.test.ts'), 0)
  assert.equal(await classErrors(code, 'src/features/x.tsx'), 0)
})

test('an inline disable with a reason passes', async () => {
  assert.equal(
    await classErrors(
      `// eslint-disable-next-line meddies/no-cosmetic-class-assertions -- emphasis is the only signal\nexpect(el).toHaveClass('bg-accent')\n`,
    ),
    0,
  )
})
