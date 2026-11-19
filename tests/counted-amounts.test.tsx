import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, test, vi } from 'vitest'
import { fixtureQueryClient } from '../src/features/design-lab/fixture-query'
import type { Medicine } from '../src/features/medicines/contract'
import { MedicinePanel } from '../src/features/medicines/medicine-panel'
import { TypeTile } from '../src/features/medicines/type-tile'
import type { DailySchedule, DoseRecord } from '../src/features/schedules/contract'
import { HistoryDay } from '../src/features/schedules/history-day'
import { scheduleHistoryDay } from '../src/features/schedules/occurrences'
import { SchedulePanel } from '../src/features/schedules/schedule-panel'
import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import type { MedicineType } from '../src/lib/quantity-policy'

// Puff and drop amounts on Today, History and Medication detail (#343, 265·S8, S9): whole
// amounts worded by the shared quantity policy beside the strength, the Type icon on the Up next
// tile, and the Type in lower case on Medication detail. Catches a screen that words puffs or
// drops, or names the Type, outside the policy, or changes Tablet, Capsule and Liquid rows.

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const TODAY = '2026-11-09'
/** 06:30 Istanbul, before the 07:00 Eye drops. */
const EARLY = '2026-11-09T03:30:00.000Z'
/** 10:00 Istanbul, after the 07:00 and 08:00 doses, before the 14:00 Salbutamol. */
const LATER = '2026-11-09T07:00:00.000Z'

const base = { strength: null, revision: 1 }
const medicine = (n: number, label: string, unit: MedicineType, strength: string): Medicine => ({
  ...base,
  id: `00000000-0000-4000-8000-00000000000${n}`,
  label,
  strength,
  unit,
})
const salbutamol = medicine(1, 'Salbutamol', 'inhaler', '100 mcg per puff')
const eyeDrops = medicine(2, 'Eye drops', 'drops', '0.5%')
const magnesium = medicine(3, 'Magnesium', 'tablet', '400 mg')
const omega = medicine(4, 'Omega 3', 'capsule', '1000 mg')
const syrup = medicine(5, 'Amoxicillin', 'liquid', '250 mg/5 ml')

const schedule = (n: number, medicineId: string, time: string, quantity: number) =>
  ({
    id: `00000000-0000-4000-8000-0000000000a${n}`,
    medicineId,
    startDate: '2026-11-02',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    times: [{ time, quantity }],
    intervalHours: null,
    endDate: null,
    confirmedAt: '2026-11-01T18:00:00.000Z',
    stoppedAt: null,
  }) satisfies DailySchedule
const puffs = schedule(1, salbutamol.id, '14:00', 2)
const drops = schedule(2, eyeDrops.id, '07:00', 1)

const taken = (scheduleId: string, dueAt: string, takenAt: string, quantity: number) =>
  ({ outcome: 'Taken', scheduleId, dueAt, takenAt, quantity, revision: 1 }) satisfies DoseRecord
/** The 07:00 Eye drops, taken at 07:05 as 2 drops. */
const dropsTaken = taken(drops.id, '2026-11-09T04:00:00.000Z', '2026-11-09T04:05:00.000Z', 2)

function renderWith(client: QueryClient, ui: ReactNode) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const clientAt = (now: string, records: DoseRecord[] = []) =>
  fixtureQueryClient({
    now,
    medicines: [salbutamol, eyeDrops],
    snapshot: { schedules: [puffs, drops], records, now, date: TODAY },
  })

/** The Up next tile's drawing, compared with the Type's own tile. */
function upNextGlyph() {
  const card = screen.getByRole('heading', { name: 'Up next' }).closest('[data-slot="card"]')
  return card?.querySelector('span[aria-hidden="true"] > svg')?.innerHTML
}
function typeGlyph(type: MedicineType) {
  const { container, unmount } = render(<TypeTile type={type} />)
  const html = container.querySelector('svg')?.innerHTML
  unmount()
  return html
}

test('Today shows "100 mcg per puff · 2 puffs" and "0.5% · 1 drop · took 2 drops" (265·S8)', async () => {
  renderWith(clientAt(LATER, [dropsTaken]), <SchedulePanel mode="today" initialNow={LATER} />)
  const list = await screen.findByRole('list', { name: "Today's doses" })
  expect(within(list).getByText('100 mcg per puff · 2 puffs')).toBeVisible()
  expect(within(list).getByText('0.5% · 1 drop · took 2 drops')).toBeVisible()
  expect(upNextGlyph()).toBe(typeGlyph('inhaler'))
})

test('Today shows the Drops icon and "0.5% · 1 drop" on Up next (265·S8)', async () => {
  renderWith(clientAt(EARLY), <SchedulePanel mode="today" initialNow={EARLY} />)
  await screen.findByRole('list', { name: "Today's doses" })
  const card = screen.getByRole('heading', { name: 'Up next' }).closest('[data-slot="card"]')
  expect(within(card as HTMLElement).getByText('0.5% · 1 drop')).toBeVisible()
  expect(upNextGlyph()).toBe(typeGlyph('drops'))
  expect(typeGlyph('drops')).not.toBe(typeGlyph('inhaler'))
})

test('History shows "1 puff" and "2 drops" beside unchanged Tablet, Capsule and Liquid rows (265·S9)', () => {
  const medicines = [salbutamol, eyeDrops, magnesium, omega, syrup]
  const schedules = [
    schedule(1, salbutamol.id, '14:00', 1),
    schedule(2, eyeDrops.id, '21:00', 2),
    schedule(3, magnesium.id, '08:00', 1.5),
    schedule(4, omega.id, '09:00', 2),
    schedule(5, syrup.id, '08:00', 5),
  ]
  const records = [
    taken(schedules[0].id, '2026-11-09T11:00:00.000Z', '2026-11-09T11:02:00.000Z', 1),
    taken(schedules[1].id, '2026-11-09T18:00:00.000Z', '2026-11-09T18:00:00.000Z', 2),
    taken(schedules[2].id, '2026-11-09T05:00:00.000Z', '2026-11-09T05:05:00.000Z', 1.5),
    taken(schedules[3].id, '2026-11-09T06:00:00.000Z', '2026-11-09T06:05:00.000Z', 2),
    taken(schedules[4].id, '2026-11-09T05:00:00.000Z', '2026-11-09T05:10:00.000Z', 4.5),
  ]
  const end = '2026-11-09T20:59:00.000Z'
  const client = fixtureQueryClient({
    now: end,
    medicines,
    snapshot: { schedules, records, now: end, date: TODAY },
  })
  const doses = scheduleHistoryDay(schedules, TODAY, new Date(end), records)
  renderWith(
    client,
    <SchedulingClockProvider serverNow={end}>
      <HistoryDay date={TODAY} today={TODAY} result={{ status: 'loaded', doses, medicines }} />
    </SchedulingClockProvider>,
  )
  const list = screen.getByRole('list', { name: 'Doses for Monday, 9 November' })
  expect(within(list).getByText('100 mcg per puff · 1 puff')).toBeVisible()
  expect(within(list).getByText('0.5% · 2 drops')).toBeVisible()
  expect(within(list).getByText('400 mg · 1½ tablets')).toBeVisible()
  expect(within(list).getByText('1000 mg · 2 capsules')).toBeVisible()
  expect(within(list).getByText('250 mg/5 ml · 5 ml · took 4.5 ml')).toBeVisible()
})

test.each([
  { med: salbutamol, line: '100 mcg per puff · inhaler', amount: '2 puffs' },
  { med: eyeDrops, line: '0.5% · drops', amount: '1 drop' },
])('Medication detail reads "$line"', async ({ med, line, amount }) => {
  renderWith(
    clientAt(LATER, [dropsTaken]),
    <MedicinePanel
      scheduleMode="detail"
      detailMedicineId={med.id}
      initialNow={LATER}
      serverEntry
    />,
  )
  expect(await screen.findByRole('heading', { name: med.label, level: 1 })).toBeVisible()
  expect(screen.getByText(line)).toBeVisible()
  const region = screen.getByRole('group', { name: 'Schedule' })
  expect(within(region).getByText(amount)).toBeVisible()
})
