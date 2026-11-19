import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import type { DailySchedule } from '../src/features/schedules/contract'
import { scheduleToday } from '../src/features/schedules/occurrences'
import { SchedulePanel } from '../src/features/schedules/schedule-panel'
import { ALL_WEEKDAYS } from '../src/features/schedules/weekdays'
import { createQueryClient } from '../src/lib/session-query-client'
import { Toaster } from '../src/components/ui/toast'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/medications',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

const amoxicillin: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Amoxicillin',
  strength: '250 mg/5 ml',
  unit: 'liquid',
}

/** Every day at 08:00 (5 ml) and 20:00 (2.5 ml). */
const schedule = (startDate: string): DailySchedule =>
  ({
    id: '00000000-0000-4000-8000-000000000101',
    medicineId: amoxicillin.id,
    startDate,
    times: [
      { time: '08:00', quantity: 5 },
      { time: '20:00', quantity: 2.5 },
    ],
    weekdays: [...ALL_WEEKDAYS],
    endDate: null,
    intervalHours: null,
    confirmedAt: '2026-11-01T18:00:00.000Z',
  }) as DailySchedule

let client: QueryClient
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1 })
  client = createQueryClient()
  window.history.replaceState(null, '', '/medications')
})
afterEach(() => {
  client.clear()
  vi.useRealTimers()
})

function renderDetail(initialNow: string, schedules: DailySchedule[]) {
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [amoxicillin] })),
    http.get('/api/schedules', () =>
      HttpResponse.json({
        schedules,
        earlierSchedules: [],
        records: [],
        today: scheduleToday(schedules, new Date(initialNow), []),
      }),
    ),
  )
  render(
    <QueryClientProvider client={client}>
      <Toaster>
        <SchedulePanel mode="detail" initialMedicineId={amoxicillin.id} initialNow={initialNow} />
      </Toaster>
    </QueryClientProvider>,
  )
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const card = () => screen.findByRole('group', { name: 'Schedule' })

test('the next Clock dose moves on when its due time passes, with no reload', async () => {
  // 19:59:30 on Monday 9 November in Istanbul.
  renderDetail('2026-11-09T16:59:30.000Z', [schedule('2026-11-02')])
  expect(within(await card()).getByText('Next at 20:00 · 2.5 ml')).toBeVisible()
  await advance(31_000)
  expect(within(await card()).getByText('Next at 08:00 · 5 ml')).toBeVisible()
})

test('a schedule starting tomorrow shows its next dose once midnight passes', async () => {
  // 23:59:30 on Monday 9 November in Istanbul; the schedule starts Tue 10 Nov.
  renderDetail('2026-11-09T20:59:30.000Z', [schedule('2026-11-10')])
  expect(within(await card()).queryByText(/^Next at/)).not.toBeInTheDocument()
  await advance(31_000)
  expect(within(await card()).getByText('Next at 08:00 · 5 ml')).toBeVisible()
})
