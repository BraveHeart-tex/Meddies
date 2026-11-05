import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pressButton } from '../helpers/browser-actions.mjs'

// Captures Today, Medications and the Record dose sheet with the Cozy Care UI kit
// sample data (Thursday 14:38) for visual comparison with the design export.
export const dependencies = { auth: true, storage: true }
export const initialScheduleTime = '2035-11-08T08:00:00+03:00'

const day = initialScheduleTime.slice(0, 10)
const at = (time) => new Date(`${day}T${time}:00+03:00`).toISOString()
// The last UUID character selects the identity tint: 2 butter, 3 blush, 4 peach, 0 plum, 1 mist.
const medicines = [
  {
    id: '00000000-0000-4000-8000-0000000000d2',
    label: 'Vitamin D3',
    strength: '1000 IU',
    unit: 'tablet',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a3',
    label: 'Magnesium',
    strength: '200 mg',
    unit: 'tablet',
  },
  {
    id: '00000000-0000-4000-8000-0000000000b4',
    label: 'Omega-3',
    strength: '1000 mg',
    unit: 'capsule',
  },
  {
    id: '00000000-0000-4000-8000-0000000000c0',
    label: 'Iron bisglycinate',
    strength: '14 mg',
    unit: 'tablet',
  },
  {
    id: '00000000-0000-4000-8000-0000000000e1',
    label: 'Cetirizine',
    strength: '10 mg',
    unit: 'tablet',
  },
]
const schedules = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    medicineId: medicines[0].id,
    times: [{ time: '09:00', quantity: 1 }],
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    medicineId: medicines[1].id,
    times: [{ time: '14:00', quantity: 1 }],
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    medicineId: medicines[2].id,
    times: [{ time: '20:00', quantity: 1 }],
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    medicineId: medicines[3].id,
    times: [{ time: '08:00', quantity: 1 }],
    weekdays: [1, 3, 5],
  },
]
// MEDDIES_VISUAL_VIEWPORTS=195x422 approximates 390px at 200% zoom.
const viewports = (process.env.MEDDIES_VISUAL_VIEWPORTS || '390x844,320x740')
  .split(',')
  .map((size) => size.split('x').map(Number))

export async function run({ origin, browser, request, artifactDir, setScheduleTime }) {
  const out = resolve(process.env.MEDDIES_VISUAL_OUT || artifactDir)
  await mkdir(out, { recursive: true })
  const post = (path, body, method = 'POST') =>
    request(path, {
      method,
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  browser.step('seed the UI kit sample routine')
  for (const medicine of medicines)
    assert.equal((await post('/api/medicines', medicine)).status, 200)
  for (const schedule of schedules)
    assert.equal((await post('/api/schedules', { ...schedule, startDate: day })).status, 200)
  await setScheduleTime(`${day}T09:12:00+03:00`)
  const taken = await post(
    '/api/schedules',
    {
      outcome: 'Taken',
      scheduleId: schedules[0].id,
      dueAt: at('09:00'),
      takenAt: at('09:12'),
      quantity: 1,
    },
    'PUT',
  )
  assert.equal(taken.status, 200)
  await setScheduleTime(`${day}T14:38:00+03:00`)

  const shot = async (name, full = false) =>
    browser.run('screenshot', ...(full ? ['--full'] : []), resolve(out, `${name}.png`))

  for (const [width, height] of viewports) {
    const size = `${width}x${height}`
    browser.step(`capture Today at ${size}`)
    await browser.run('set', 'viewport', String(width), String(height))
    await browser.open(origin)
    await browser.run('wait', 'li[data-dose-id]')
    await shot(`prod-today-${size}`)
    await shot(`prod-today-${size}-full`, true)

    browser.step(`capture the Record dose sheet at ${size}`)
    const trigger = 'button[aria-label^="Record dose for Magnesium"]'
    await browser.run('wait', trigger)
    await browser.run('focus', trigger)
    await browser.run('press', 'Enter')
    await browser.run('wait', '[role="dialog"]')
    await browser.run('wait', '1000')
    await shot(`prod-sheet-${size}`)
    await pressButton(browser.run, 'I took it')
    await browser.run('wait', '500')
    await shot(`prod-sheet-taken-${size}`)
    await browser.run('press', 'Escape')

    browser.step(`capture Medications at ${size}`)
    await browser.open(`${origin}/medications`)
    await browser.run('wait', '--text', 'Cetirizine')
    await shot(`prod-medications-${size}`)
    await shot(`prod-medications-${size}-full`, true)
  }
}
