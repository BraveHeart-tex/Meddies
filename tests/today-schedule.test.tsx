import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import { MedicinePanel } from '../src/features/medicines/medicine-panel'
import { medicineKeys } from '../src/features/medicines/queries'
import type { DailySchedule, DoseOutcomeRecord } from '../src/features/schedules/contract'
import { scheduleToday } from '../src/features/schedules/occurrences'
import { scheduleKeys } from '../src/features/schedules/queries'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}))

const medicine: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Morning Tablet',
  strength: null,
  unit: 'tablet',
}
const scheduleFor = (time: string): DailySchedule => ({
  id: '00000000-0000-4000-8000-0000000000a1',
  medicineId: medicine.id,
  startDate: '2026-11-01',
  times: [{ time, quantity: 1 }],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  confirmedAt: '2026-10-31T09:00:00.000Z',
})
// 08:55 in Istanbul (UTC+3); the dose is due at 09:00.
const initialNow = '2026-11-14T05:55:00.000Z'
const doses = () => screen.findByRole('list', { name: "Today's doses" })

/** Serves the schedules snapshot at the server scheduling time `now`, counting reads. */
function schedulesApi(now: string, schedules = [scheduleFor('09:00')]) {
  let serverNow = now
  let records: DoseOutcomeRecord[] = []
  let reads = 0
  let failures = 0
  let gate: Promise<void> | null = null
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
    http.get('/api/schedules', async () => {
      reads++
      // The read sees the records stored when it arrived, however late it answers.
      const seen = records
      if (gate) await gate
      if (failures > 0) {
        failures--
        return HttpResponse.json({ error: 'unavailable' }, { status: 503 })
      }
      return HttpResponse.json({
        schedules,
        records: seen,
        today: scheduleToday(schedules, new Date(serverNow), seen),
      })
    }),
    http.put('/api/schedules', async ({ request }) => {
      const body = (await request.json()) as { scheduleId: string; dueAt: string }
      const record: DoseOutcomeRecord = {
        outcome: 'Skipped',
        scheduleId: body.scheduleId,
        dueAt: body.dueAt,
        recordedAt: serverNow,
      }
      records = [record]
      return HttpResponse.json({ record })
    }),
  )
  return {
    reads: () => reads,
    /** Moves the server scheduling clock. */
    at: (next: string) => (serverNow = next),
    failNext: () => failures++,
    hold: () => {
      let release = () => {}
      gate = new Promise((resolve) => (release = resolve))
      return () => {
        gate = null
        release()
      }
    },
  }
}

let client: QueryClient

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  client = createQueryClient()
  client.setQueryData(medicineKeys.list(), [medicine], { updatedAt: Date.now() })
})

afterEach(() => {
  client.clear()
  onlineManager.setOnline(true)
})

function renderToday(now = initialNow) {
  render(
    <QueryClientProvider client={client}>
      <MedicinePanel scheduleMode="today" initialNow={now} />
    </QueryClientProvider>,
  )
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('freshness', () => {
  test('statuses advance on the scheduling clock with no read on a timer', async () => {
    const api = schedulesApi(initialNow)
    renderToday()
    expect(await doses()).toHaveTextContent('Scheduled')
    expect(api.reads()).toBe(1)
    await advance(6 * 60_000)
    expect(await doses()).toHaveTextContent('Not logged')
    await advance(5 * 60_000)
    expect(api.reads()).toBe(1)
  })

  test('a new day reads its own data instead of carrying the old records over', async () => {
    // 23:58 in Istanbul; today's 09:00 dose has passed.
    const lateNight = '2026-11-14T20:58:00.000Z'
    const api = schedulesApi(lateNight)
    renderToday(lateNight)
    expect(await doses()).toHaveTextContent('Not logged')
    const release = api.hold()
    api.at('2026-11-14T21:00:30.000Z')
    await advance(3 * 60_000)
    await waitFor(() => expect(api.reads()).toBe(2))
    expect(screen.queryByRole('list', { name: "Today's doses" })).not.toBeInTheDocument()
    expect(screen.getByText('Loading your scheduled doses and medicines...')).toBeVisible()
    release()
    expect(await doses()).toHaveTextContent('Scheduled')
    expect(screen.getByText('Sunday, 15 November')).toBeVisible()
    expect(api.reads()).toBe(2)
  })
})

describe('with a cached snapshot', () => {
  /** Seeds the session cache with a snapshot read at the server time `now`. */
  function cache(now: string, schedules = [scheduleFor('09:00')]) {
    client.setQueryData(
      scheduleKeys.snapshot(),
      { schedules, records: [], now, date: '2026-11-14' },
      { updatedAt: Date.now() },
    )
  }

  test('entry shows the cached doses while one refresh runs', async () => {
    const api = schedulesApi(initialNow, [
      scheduleFor('09:00'),
      { ...scheduleFor('10:00'), id: '00000000-0000-4000-8000-0000000000a2' },
    ])
    cache(initialNow)
    const release = api.hold()
    renderToday()
    expect(await doses()).toHaveTextContent('09:00')
    await waitFor(() => expect(api.reads()).toBe(1))
    expect(
      screen.queryByText('Loading your scheduled doses and medicines...'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled()
    release()
    expect(await doses()).toHaveTextContent('10:00')
    expect(screen.getByRole('button', { name: 'Refresh Today' })).toBeEnabled()
    expect(api.reads()).toBe(1)
  })

  test('focus and reconnect each refresh once', async () => {
    const api = schedulesApi(initialNow)
    cache(initialNow)
    renderToday()
    await waitFor(() => expect(api.reads()).toBe(1))
    await advance(1_000)
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(api.reads()).toBe(2))
    fireEvent(window, new Event('offline'))
    await advance(1_000)
    expect(api.reads()).toBe(2)
    fireEvent(window, new Event('online'))
    await waitFor(() => expect(api.reads()).toBe(3))
    await advance(5 * 60_000)
    expect(api.reads()).toBe(3)
  })

  test('a newer server time re-anchors the statuses', async () => {
    const api = schedulesApi('2026-11-14T06:01:00.000Z')
    cache(initialNow)
    const release = api.hold()
    renderToday()
    expect(await doses()).toHaveTextContent('Scheduled')
    release()
    await waitFor(() =>
      expect(screen.getByRole('list', { name: "Today's doses" })).toHaveTextContent('Not logged'),
    )
    expect(api.reads()).toBe(1)
  })

  test('a failed refresh keeps the doses, and retry recovers', async () => {
    const api = schedulesApi(initialNow)
    api.failNext()
    cache(initialNow)
    const user = renderToday()
    expect(await screen.findByText(/Today could not be refreshed/)).toBeVisible()
    expect(await doses()).toHaveTextContent('Morning Tablet')
    await user.click(screen.getByRole('button', { name: 'Retry Today' }))
    await waitFor(() =>
      expect(screen.queryByText(/Today could not be refreshed/)).not.toBeInTheDocument(),
    )
    expect(await doses()).toHaveTextContent('Morning Tablet')
    expect(api.reads()).toBe(2)
  })
})

describe('recording a dose', () => {
  test('a read started before the save cannot overwrite the confirmed outcome', async () => {
    const api = schedulesApi(initialNow)
    const user = renderToday()
    expect(await doses()).toHaveTextContent('Scheduled')
    // A focus refresh starts before the save and answers after it, without the record.
    const release = api.hold()
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(api.reads()).toBe(2))
    await user.click(screen.getByRole('button', { name: /^Record dose for Morning Tablet/ }))
    await user.click(await screen.findByRole('button', { name: 'I skipped it' }))
    await user.click(await screen.findByRole('button', { name: 'Save as skipped' }))
    await waitFor(() =>
      expect(screen.getByRole('list', { name: "Today's doses" })).toHaveTextContent('Skipped'),
    )
    release()
    await waitFor(() => expect(api.reads()).toBe(3))
    await advance(1_000)
    expect(screen.getByRole('list', { name: "Today's doses" })).toHaveTextContent('Skipped')
  })
})

describe('with no cache', () => {
  test('a failed first read shows the error, and retry loads Today', async () => {
    const api = schedulesApi(initialNow)
    api.failNext()
    const user = renderToday()
    expect(await screen.findByText(/Today could not be refreshed/)).toBeVisible()
    expect(screen.queryByRole('list', { name: "Today's doses" })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry Today' }))
    expect(await doses()).toHaveTextContent('Scheduled')
    expect(api.reads()).toBe(2)
  })
})
