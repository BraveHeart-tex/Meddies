import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ESLint } from 'eslint'
import { wallClockOwners } from '../eslint.config.mjs'

const eslint = new ESLint()

async function clockErrors(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((message) => /clock/i.test(message.message)).length
}

test('argless new Date() and Date.now() fail in application code', async () => {
  assert.equal(await clockErrors('export const a = new Date()\n', 'src/features/x.ts'), 1)
  assert.equal(await clockErrors('export const a = new Date\n', 'src/features/x.ts'), 1)
  assert.equal(await clockErrors('export const a = Date.now()\n', 'src/features/x.tsx'), 1)
})

test('a Date built from a value stays allowed', async () => {
  assert.equal(await clockErrors('export const a = new Date(0)\n', 'src/features/x.ts'), 0)
})

test('the allowlisted clock owners may read the wall clock', async () => {
  for (const file of wallClockOwners)
    assert.equal(await clockErrors('export const a = Date.now()\n', file), 0, file)
})

test('the route link rule still applies alongside the clock rule', async () => {
  const [result] = await eslint.lintText('export const a = <B nativeButton={false} />\n', {
    filePath: 'src/features/auth/session-boundary.tsx',
  })
  assert.ok(result.messages.some((message) => /route links/.test(message.message)))
})
