import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'vitest'
import { ESLint } from 'eslint'
import { settledCaptureTests } from '../eslint.config.mjs'

// Catches a direct screenshot in an owned capture case, which could capture a Drawer mid-motion.
const eslint = new ESLint()
const spec = 'tests/browser/screen-capture.spec.ts'
const [owned] = settledCaptureTests

async function captureErrors(code: string, filePath = spec) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((message) => message.ruleId === 'meddies/settled-captures').length
}

const ownedCase = (body: string) =>
  `test(${JSON.stringify(owned)}, { tag: '@visual' }, async ({ page }) => {\n${body}\n})\n`

test('the save recovery case is owned', () => {
  assert.deepEqual(settledCaptureTests, ['capture save recovery copy'])
})

test('a direct screenshot in the owned case fails', async () => {
  for (const call of [
    `await page.screenshot({ path: 'a.png' })`,
    `await page.getByRole('dialog').screenshot({ path: 'a.png' })`,
  ])
    assert.equal(await captureErrors(ownedCase(call)), 1, call)
})

test('a direct screenshot in a helper nested in the owned case fails', async () => {
  const nested = `async function captureDoseReceipt() {\n  for (const width of [402]) await page.screenshot({ path: 'a.png' })\n}\nawait captureDoseReceipt()`
  assert.equal(await captureErrors(ownedCase(nested)), 1)
  const arrow = `const capture = async () => page.screenshot({ path: 'a.png' })\nawait capture()`
  assert.equal(await captureErrors(ownedCase(arrow)), 1)
})

test('captureSettled in the owned case passes', async () => {
  assert.equal(await captureErrors(ownedCase(`await captureSettled(page, { path: 'a.png' })`)), 0)
})

test('the shared helper and unowned capture paths pass', async () => {
  const helper = 'tests/browser/settled-capture.ts'
  assert.equal(await captureErrors(await readFile(helper, 'utf8'), helper), 0)
  assert.equal(
    await captureErrors(
      `test('capture read recovery copy', async ({ page }) => {\n  await page.screenshot({ path: 'a.png' })\n})\n`,
    ),
    0,
  )
  assert.equal(
    await captureErrors(`export async function capture(page) { await page.screenshot({}) }\n`),
    0,
  )
})

test('the current screen capture spec passes', async () => {
  assert.equal(await captureErrors(await readFile(spec, 'utf8')), 0)
})
