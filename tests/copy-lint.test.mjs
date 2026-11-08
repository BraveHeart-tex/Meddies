import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ESLint } from 'eslint'

const eslint = new ESLint()

async function copyErrors(code, filePath = 'src/features/x.tsx') {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((message) => message.ruleId === 'meddies/banned-ui-words').length
}

test('a banned word fails in JSX text', async () => {
  assert.equal(await copyErrors('export const a = <p>Edit outcome</p>\n'), 1)
})

test('a banned word fails in aria-label, label and title props', async () => {
  assert.equal(await copyErrors('export const a = <B aria-label="Edit outcome" />\n'), 1)
  assert.equal(await copyErrors('export const a = <B label="Record intake" />\n'), 1)
  assert.equal(await copyErrors('export const a = <B title="Correct this dose" />\n'), 1)
})

test('a banned word fails inside expression containers, conditionals and templates', async () => {
  assert.equal(await copyErrors(`export const a = <B aria-label={'Edit outcome'} />\n`), 1)
  assert.equal(
    await copyErrors(`export const a = (x) => <B title={x ? 'Saved' : 'Unconfirmed'} />\n`),
    1,
  )
  assert.equal(await copyErrors('export const a = (x) => <B label={`${x} confirmed`} />\n'), 1)
  assert.equal(await copyErrors(`export const a = <p>{'Dose confirmed'}</p>\n`), 1)
})

test('an outcome identifier stays allowed', async () => {
  assert.equal(await copyErrors('export const a = (outcome) => <p>{outcome}</p>\n'), 0)
  assert.equal(await copyErrors('export const a = (outcome) => <B aria-label={outcome} />\n'), 0)
  assert.equal(await copyErrors('export const a = (outcome) => <B outcome={outcome} />\n'), 0)
})

test('only whole words match', async () => {
  assert.equal(await copyErrors('export const a = <p>That is incorrect. Confirm it.</p>\n'), 0)
  assert.equal(await copyErrors('export const a = <B title="Outcomes page" />\n'), 0)
})

test('props outside the rule, plain constants and routine are left to review', async () => {
  assert.equal(await copyErrors('export const a = <B id="outcome" />\n'), 0)
  assert.equal(await copyErrors(`export const a = 'Edit outcome'\n`), 0)
  assert.equal(await copyErrors('export const a = <p>Keep your routine tidy</p>\n'), 0)
})

test('the rule covers application TSX only', async () => {
  assert.equal(await copyErrors('export const a = <p>Edit outcome</p>\n', 'tests/x.tsx'), 0)
})

test('the existing restricted-syntax rules still apply to TSX', async () => {
  const [result] = await eslint.lintText('export const a = <B nativeButton={false} />\n', {
    filePath: 'src/features/x.tsx',
  })
  assert.ok(result.messages.some((message) => /route links/.test(message.message)))
})
