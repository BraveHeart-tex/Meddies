import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ESLint } from 'eslint'

const eslint = new ESLint()

async function widthErrors(code: string, filePath = 'tests/browser/x.spec.ts') {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((message) => message.ruleId === 'meddies/no-width-loop-tests')
    .length
}

const body = 'async ({ page }) => { await page.goto("/") }'

test('a test declared in a loop over widths fails', async () => {
  assert.equal(await widthErrors(`for (const width of [402, 320]) test('a', ${body})\n`), 1)
})

test('describe and modifier declarations in a width loop fail', async () => {
  for (const declaration of [
    `test.describe('a', () => {})`,
    `test.describe.parallel('a', () => {})`,
    `test.only('a', ${body})`,
    `test.skip('a', ${body})`,
    `test.fixme('a', { tag: '@x' }, ${body})`,
  ])
    assert.equal(
      await widthErrors(`for (const width of [402, 320]) ${declaration}\n`),
      1,
      declaration,
    )
})

test('a describe in a width loop reports once, not again for its tests', async () => {
  assert.equal(
    await widthErrors(
      `for (const width of [402, 320]) test.describe('a', () => { test('b', ${body}) })\n`,
    ),
    1,
  )
})

test('every loop form over widths or viewports fails', async () => {
  const declared = `test('a', ${body})`
  for (const code of [
    `for (const { width, height } of sizes) ${declared}`,
    `for (const size of [{ width: 320, height: 740 }]) ${declared}`,
    `for (const viewport of [a, b]) { ${declared} }`,
    `for (const [name, size] of Object.entries(layoutViewports)) ${declared}`,
    `for (const key in viewports) ${declared}`,
    `for (let width = 320; width < 500; width += 80) ${declared}`,
    `viewports.forEach((size) => { ${declared} })`,
    `[320, 402].map((width) => ${declared})`,
    `const sizes = [{ width: 320 }]\nfor (const size of sizes) ${declared}`,
  ])
    assert.equal(await widthErrors(`${code}\n`), 1, code)
})

test('a loop nesting a width loop fails only inside the width loop', async () => {
  assert.equal(
    await widthErrors(
      `for (const route of routes) for (const width of [320]) test('a', ${body})\n`,
    ),
    1,
  )
})

test('tests in loops over routes or other values pass', async () => {
  const declared = `test('a', ${body})`
  for (const code of [
    `for (const route of ['/', '/history']) ${declared}`,
    `for (const { path, firstLink } of [{ path: '/', firstLink: 'Settings' }]) ${declared}`,
    `routes.forEach((route) => { ${declared} })`,
    `for (const reason of ['width', 'viewport']) ${declared}`,
    `const routes = ['/']\nfor (const route of routes) ${declared}`,
  ])
    assert.equal(await widthErrors(`${code}\n`), 0, code)
})

test('a width loop inside a test body passes', async () => {
  assert.equal(
    await widthErrors(
      `test('a', async ({ page }) => { for (const width of [402, 320]) await page.setViewportSize({ width, height: 800 }) })\n`,
    ),
    0,
  )
})

test('steps, hooks and runtime skips in a width loop pass', async () => {
  for (const call of [
    `test.step('a', async () => {})`,
    `test.beforeEach(${body})`,
    `test.use({ viewport: size })`,
    `test.skip(true, 'reason')`,
    `test.describe.configure({ mode: 'serial' })`,
  ])
    assert.equal(await widthErrors(`for (const width of [320]) ${call}\n`), 0, call)
})

test('the rule covers journeys only', async () => {
  const code = `for (const width of [402, 320]) test('a', ${body})\n`
  assert.equal(await widthErrors(code, 'tests/x.test.ts'), 0)
})

test('an inline disable with a reason passes', async () => {
  assert.equal(
    await widthErrors(
      `for (const width of [201]) {\n  // eslint-disable-next-line meddies/no-width-loop-tests -- only 201px wraps\n  test('a', ${body})\n}\n`,
    ),
    0,
  )
})
