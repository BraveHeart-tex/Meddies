import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, test, vi } from 'vitest'
import { fixtureQueryClient } from '../src/features/design-lab/fixture-query'
import type { Medicine } from '../src/features/medicines/contract'
import { MedicinePanel } from '../src/features/medicines/medicine-panel'
import type { DailySchedule, DoseRecord } from '../src/features/schedules/contract'
import { HistoryDay } from '../src/features/schedules/history-day'
import { scheduleHistoryDay } from '../src/features/schedules/occurrences'
import { SchedulePanel } from '../src/features/schedules/schedule-panel'
import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import type { UnscheduledDose } from '../src/features/unscheduled-doses/contract'
import { seedUnscheduledDay } from '../src/features/unscheduled-doses/queries'

// Liquid amounts on Today, History and Medication detail (#265): decimal ml beside
// the strength, and the Type in lower case on Medication detail. Catches a screen that formats
// ml amounts or names the Type outside the shared quantity policy.

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const TODAY = '2026-11-09'
/** 07:30 Istanbul, before the 08:00 dose. */
const EARLY = '2026-11-09T04:30:00.000Z'
/** 10:00 Istanbul, after the 08:00 dose. */
const LATER = '2026-11-09T07:00:00.000Z'

const syrup: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Amoxicillin',
  strength: '250 mg/5 ml',
  unit: 'liquid',
  revision: 1,
}
const schedule: DailySchedule = {
  id: '00000000-0000-4000-8000-0000000000a1',
  medicineId: syrup.id,
  startDate: '2026-11-02',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  times: [
    { time: '08:00', quantity: 5 },
    { time: '20:00', quantity: 2.5 },
  ],
  intervalHours: null,
  endDate: null,
  confirmedAt: '2026-11-01T18:00:00.000Z',
  stoppedAt: null,
}
const morningTaken: DoseRecord = {
  outcome: 'Taken',
  scheduleId: schedule.id,
  dueAt: '2026-11-09T05:00:00.000Z',
  takenAt: '2026-11-09T05:10:00.000Z',
  quantity: 4.5,
  revision: 1,
}
const unscheduled: UnscheduledDose = {
  id: '00000000-0000-4000-8000-0000000000c1',
  actionId: '00000000-0000-4000-8000-0000000000c2',
  medicineId: syrup.id,
  takenAt: '2026-11-09T06:30:00.000Z',
  quantity: 0.5,
  outcome: 'Taken',
  revision: 1,
  removed: false,
}

function renderWith(client: QueryClient, ui: ReactNode) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const clientAt = (now: string, records: DoseRecord[] = []) =>
  fixtureQueryClient({
    now,
    medicines: [syrup],
    snapshot: { schedules: [schedule], records, now, date: TODAY },
  })

test('Today shows a Liquid dose in ml beside its strength (265·S8)', async () => {
  renderWith(clientAt(EARLY), <SchedulePanel mode="today" initialNow={EARLY} />)
  const list = await screen.findByRole('list', { name: "Today's doses" })
  expect(within(list).getByText('250 mg/5 ml · 5 ml')).toBeVisible()
  expect(within(list).getByText('250 mg/5 ml · 2.5 ml')).toBeVisible()
})

test('History shows a Liquid Taken amount and an Unscheduled dose in decimal ml (265·S9)', () => {
  const client = clientAt(LATER, [morningTaken])
  seedUnscheduledDay(client, TODAY, [unscheduled])
  const doses = scheduleHistoryDay([schedule], TODAY, new Date(LATER), [morningTaken])
  renderWith(
    client,
    <SchedulingClockProvider serverNow={LATER}>
      <HistoryDay
        date={TODAY}
        today={TODAY}
        result={{ status: 'loaded', doses, medicines: [syrup] }}
      />
    </SchedulingClockProvider>,
  )
  const list = screen.getByRole('list', { name: 'Doses for Monday, 9 November' })
  expect(within(list).getByText('250 mg/5 ml · 5 ml · took 4.5 ml')).toBeVisible()
  expect(within(list).getByText('250 mg/5 ml · 0.5 ml · Not on a schedule')).toBeVisible()
})

test('Medication detail names the Type in lower case and lists ml amounts', async () => {
  renderWith(
    clientAt(LATER, [morningTaken]),
    <MedicinePanel
      scheduleMode="detail"
      detailMedicineId={syrup.id}
      initialNow={LATER}
      serverEntry
    />,
  )
  expect(await screen.findByRole('heading', { name: 'Amoxicillin', level: 1 })).toBeVisible()
  expect(screen.getByText('250 mg/5 ml · liquid')).toBeVisible()
  const rows = within(screen.getByRole('region', { name: 'Schedule' })).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(within(rows[0]).getByText('5 ml')).toBeVisible()
  expect(within(rows[1]).getByText('2.5 ml')).toBeVisible()
})
