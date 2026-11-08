import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, test } from './fixtures'
import { addDays, insertScheduledMedicine } from './seed'

const initialScheduleTime = '2035-06-15T14:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const medicine = 'Credential Fixture Medicine'
const secretNames = ['MEDICINES_WORKER_SECRET', 'AUTH_SECRET']

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: medicine,
        startDate: addDays(today, -1),
        times: [{ time: '08:00', quantity: 1 }],
      }),
  },
})

/** The secret values the production build could have read: its environment and env files. */
async function buildTimeSecrets() {
  const values = secretNames.map((name) => process.env[name])
  for (const file of ['.env', '.env.local']) {
    const text = await readFile(resolve(file), 'utf8').catch(() => '')
    for (const name of secretNames)
      values.push(text.match(new RegExp(`^${name}=["']?([^"'\\n]+)`, 'm'))?.[1])
  }
  return values.filter((value): value is string => !!value)
}

// Assertions compare booleans and file names, so a failure never prints a credential.
test('streamed pages and client bundles carry no credentials', async ({ page, app }) => {
  const { sessionToken, authSecret, workerSecret } = app.credentials()
  const credentials = { sessionToken, authSecret, workerSecret }

  await test.step('the checked HTML is the signed-in view', async () => {
    const response = await page.goto('/')
    await page.waitForLoadState('load')
    const html = await response!.text()
    expect(html.includes(medicine), 'hydration data must hold private content').toBe(true)
  })

  for (const path of ['/', `/history?date=${today}`, '/settings', '/medications']) {
    await test.step(`streamed HTML and hydration data for ${path}`, async () => {
      const response = await page.goto(path)
      await page.waitForLoadState('load')
      const html = await response!.text()
      const dom = await page.content()
      expect(html.includes('__next_f'), 'the response must include hydration data').toBe(true)
      for (const [name, value] of Object.entries(credentials)) {
        expect(html.includes(value), `${name} in the streamed HTML`).toBe(false)
        expect(dom.includes(value), `${name} in the hydrated DOM`).toBe(false)
      }
    })
  }

  await test.step('built client bundles', async () => {
    // The build predates this run's generated values, so check what a bundle could really hold:
    // a reference to a secret's name, or the value the build itself could read.
    const root = resolve('.next/static')
    const entries = await readdir(root, { recursive: true, withFileTypes: true })
    const scripts = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map((entry) => join(entry.parentPath, entry.name))
    expect(scripts.length, 'the production build must have client bundles').toBeGreaterThan(0)
    const forbidden = [...secretNames, ...(await buildTimeSecrets())]
    const bundles = await Promise.all(scripts.map((script) => readFile(script, 'utf8')))
    const leaking = scripts.filter((_, index) =>
      forbidden.some((value) => bundles[index]!.includes(value)),
    )
    expect(leaking).toEqual([])
  })
})
