import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import type { DailySchedule } from '../src/features/schedules/contract'
import { scheduleToday } from '../src/features/schedules/occurrences'
import { SchedulePanel } from '../src/features/schedules/schedule-panel'
import { ALL_WEEKDAYS } from '../src/features/schedules/weekdays'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/medications',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

// 10:00 on Monday 9 November in Istanbul.
const initialNow = '2026-11-09T07:00:00.000Z'
const medicine = (n: number, label: string): Medicine => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  label,
  strength: null,
  unit: 'tablet',
})
const magnesium = medicine(1, 'Magnesium')
const iron = medicine(2, 'Iron')
const omega = medicine(3, 'Omega 3')
const zinc = medicine(4, 'Zinc')
const vitaminD = medicine(5, 'Vitamin D')

const version = (n: number, medicineId: string, extra: Partial<DailySchedule> = {}) =>
  ({
    id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    medicineId,
    startDate: '2026-11-02',
    times: [
      { time: '08:00', quantity: 1 },
      { time: '20:00', quantity: 1 },
    ],
    weekdays: [...ALL_WEEKDAYS],
    endDate: null,
    intervalHours: null,
    confirmedAt: '2026-11-01T18:00:00.000Z',
    ...extra,
  }) as DailySchedule

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
  window.history.replaceState(null, '', '/medications')
})
afterEach(() => client.clear())

function api(medicines: Medicine[], schedules: DailySchedule[]) {
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines })),
    http.get('/api/schedules', () =>
      HttpResponse.json({
        schedules,
        earlierSchedules: [],
        records: [],
        today: scheduleToday(schedules, new Date(initialNow), []),
      }),
    ),
  )
}

function renderList() {
  render(
    <QueryClientProvider client={client}>
      <SchedulePanel mode="list" initialNow={initialNow} />
    </QueryClientProvider>,
  )
}

const rows = (group: string) =>
  within(screen.getByRole('region', { name: group }))
    .getAllByRole('listitem')
    .map((item) => item.textContent)

test('779·A20 Ended schedules sit in their own group below the others', async () => {
  api(
    [magnesium, iron, omega, zinc, vitaminD],
    [
      // Runs through its Last day today.
      version(1, magnesium.id, { endDate: '2026-11-09' }),
      // Every 7 hours from Tue 3 Nov at 22:00: next at 11:00 today.
      version(2, iron.id, {
        startDate: '2026-11-03',
        times: [{ time: '22:00', quantity: 1 }],
        intervalHours: 7,
      }),
      version(4, zinc.id, { endDate: '2026-11-03' }),
      // Stopped at 09:00 today.
      version(5, vitaminD.id, { stoppedAt: '2026-11-09T06:00:00.000Z' }),
    ],
  )
  renderList()
  expect(await screen.findByRole('region', { name: 'Ended' })).toBeVisible()
  const groups = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))
  expect(groups.filter(Boolean)).toEqual(['On a schedule', 'No schedule', 'Ended'])
  expect(rows('On a schedule').join('|')).toMatch(/Magnesium.*Every day · 08:00, 20:00/)
  expect(rows('On a schedule').join('|')).toMatch(/Iron.*Every 7 hours · Next at 11:00/)
  expect(rows('No schedule').join('|')).toMatch(/Omega 3/)
  expect(rows('Ended')).toEqual([
    expect.stringMatching(/Zinc.*Ended Tue 3 Nov/),
    expect.stringMatching(/Vitamin D.*Ended Mon 9 Nov/),
  ])
})

test('779·A20 an Interval row never shows a next dose after its Last day', async () => {
  // Every 24 hours at 09:00: today's has passed and tomorrow's is after the Last day.
  api(
    [iron],
    [
      version(2, iron.id, {
        times: [{ time: '09:00', quantity: 1 }],
        intervalHours: 24,
        endDate: '2026-11-09',
      }),
    ],
  )
  renderList()
  expect(await screen.findByRole('region', { name: 'On a schedule' })).toBeVisible()
  expect(rows('On a schedule')).toEqual([expect.stringMatching(/Iron.*Every 24 hours/)])
  expect(rows('On a schedule')[0]).not.toMatch(/Next/)
})
