import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ESLint } from 'eslint'

const eslint = new ESLint()

async function dateFormatErrors(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((message) => /calendar-date/.test(message.message)).length
}

test('Intl.DateTimeFormat fails in application code', async () => {
  const code = "export const a = new Intl.DateTimeFormat('en-GB')\n"
  assert.equal(await dateFormatErrors(code, 'src/features/x.ts'), 1)
  assert.equal(await dateFormatErrors(code, 'src/app/x.tsx'), 1)
  assert.equal(await dateFormatErrors('export const a = Intl.DateTimeFormat\n', 'src/lib/x.ts'), 1)
})

test('toLocale*String fails in application code', async () => {
  for (const method of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'])
    assert.equal(
      await dateFormatErrors(`export const a = (b: Date) => b.${method}()\n`, 'src/lib/x.tsx'),
      1,
      method,
    )
})

test('the central date module may format', async () => {
  const code = "export const a = new Intl.DateTimeFormat('en-GB').format(0)\n"
  assert.equal(await dateFormatErrors(code, 'src/lib/calendar-date.ts'), 0)
})

test('code outside src and other locale methods stay allowed', async () => {
  const code = "export const a = new Intl.DateTimeFormat('en-GB')\n"
  assert.equal(await dateFormatErrors(code, 'tests/x.ts'), 0)
  const lower = 'export const a = (b: string) => b.toLocaleLowerCase()\n'
  assert.equal(await dateFormatErrors(lower, 'src/lib/x.ts'), 0)
})
