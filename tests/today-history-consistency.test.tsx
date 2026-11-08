import { dehydrate, hydrate, QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Toaster } from '../src/components/ui/toast'
import type { Medicine } from '../src/features/medicines/contract'
import { medicineKeys } from '../src/features/medicines/queries'
import type {
  DailySchedule,
  DoseOccurrence,
  DoseOutcomeRecord,
} from '../src/features/schedules/contract'
import { HistoryResults } from '../src/features/schedules/history-results'
import { scheduleKeys } from '../src/features/schedules/queries'
import { SchedulePanel } from '../src/features/schedules/schedule-panel'
import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import { TodayHeader } from '../src/features/schedules/today-header'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'
import { formatLongDay } from '../src/lib/calendar-date'

let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}))

const medicine: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Morning Tablet',
  strength: null,
  unit: 'tablet',
}
const schedule: DailySchedule = {
  id: '00000000-0000-4000-8000-0000000000a1',
  medicineId: medicine.id,
  startDate: '2026-11-01',
  times: [{ time: '09:00', quantity: 1 }],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  confirmedAt: '2026-10-31T09:00:00.000Z',
}
// Fri 6 Nov, 09:05 in Istanbul (UTC+3); each day's dose is due at 09:00.
const today = '2026-11-06'
const now = '2026-11-06T06:05:00.000Z'
const dueOn = (date: string) => new Date(`${date}T09:00:00+03:00`).toISOString()
const takenRecord = (date: string, revision = 0): DoseOutcomeRecord => ({
  scheduleId: schedule.id,
  dueAt: dueOn(date),
  outcome: 'Taken',
  takenAt: dueOn(date),
  quantity: 1,
  revision,
})

type Reply = (body: Record<string, unknown>, record: DoseOutcomeRecord) => Promise<Response | null>
/**
 * One stored record per dose across all dates. A write stores its record, then `reply` may
 * answer instead of the stored record (null keeps the normal answer).
 */
function api({
  records = [] as DoseOutcomeRecord[],
  reply = (async () => null) as Reply,
  store = true,
} = {}) {
  const state = {
    records,
    reads: { today: 0, history: [] as string[] },
    writes: [] as Record<string, unknown>[],
    store,
  }
  const dose = (date: string): DoseOccurrence => {
    const record = state.records.find((item) => item.dueAt === dueOn(date))
    const base = {
      id: `${schedule.id}:${dueOn(date)}`,
      scheduleId: schedule.id,
      medicineId: medicine.id,
      dueAt: dueOn(date),
      quantity: 1,
    }
    return (
      record ? { ...base, status: record.outcome, record } : { ...base, status: 'Not logged' }
    ) as DoseOccurrence
  }
  const write = async (request: Request, method: 'PUT' | 'PATCH') => {
    const body = (await request.json()) as Record<string, unknown>
    state.writes.push(body)
    const record = {
      scheduleId: body.scheduleId,
      dueAt: body.dueAt,
      outcome: body.outcome,
      ...(body.outcome === 'Taken'
        ? { takenAt: body.takenAt, quantity: body.quantity }
        : { recordedAt: now }),
      revision: method === 'PATCH' ? Number(body.expectedRevision) + 1 : 0,
      ...(method === 'PATCH' ? { actionId: body.actionId } : {}),
    } as DoseOutcomeRecord
    if (state.store)
      state.records = [...state.records.filter((item) => item.dueAt !== record.dueAt), record]
    return (await reply(body, record)) ?? HttpResponse.json({ record })
  }
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
    http.get('/api/schedules', () => {
      state.reads.today++
      return HttpResponse.json({
        schedules: [schedule],
        records: state.records.filter((item) => item.dueAt === dueOn(today)),
        today: { now, date: today },
      })
    }),
    http.get('/api/schedules/history', ({ request }) => {
      const date = new URL(request.url).searchParams.get('date')!
      state.reads.history.push(date)
      return HttpResponse.json({ doses: [dose(date)] })
    }),
    http.put('/api/schedules', ({ request }) => write(request, 'PUT')),
    http.patch('/api/schedules', ({ request }) => write(request, 'PATCH')),
  )
  return { state, dose }
}

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => (release = resolve))
  return { promise, release }
}

let client: QueryClient

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  client = createQueryClient()
  client.setQueryData(medicineKeys.list(), [medicine], { updatedAt: Date.now() })
  search = new URLSearchParams()
})

afterEach(() => {
  client.clear()
})

type View = 'today' | 'history' | 'medications'
/** One session: the Toast host stays while Today, History and Medications swap like routes. */
function session(
  seed: {
    history?: Record<string, DoseOccurrence[]>
    today?: boolean
    view?: View
    /** The History date in the URL. */
    date?: string
  } = {},
) {
  search = new URLSearchParams(`date=${seed.date ?? today}`)
  for (const [date, doses] of Object.entries(seed.history ?? {}))
    client.setQueryData(scheduleKeys.history(date), doses)
  // Today's snapshot as its server prefetch left it, with the stored records due today.
  if (seed.today)
    client.setQueryData(scheduleKeys.snapshot(), {
      schedules: [schedule],
      records: Object.values(seed.history ?? {})
        .flat()
        .flatMap((dose) => ('record' in dose && dose.dueAt === dueOn(today) ? [dose.record] : [])),
      now,
      date: today,
    })
  let go!: (view: View) => void
  function App() {
    const [{ view }, setView] = useState<{ view: View }>({ view: seed.view ?? 'today' })
    // A fresh object re-renders even for the same view, so a new URL date is read.
    go = (next) => setView({ view: next })
    return (
      <QueryClientProvider client={client}>
        <Toaster>
          {view === 'today' ? (
            <>
              <TodayHeader initialNow={now} />
              <SchedulePanel mode="today" initialNow={now} />
            </>
          ) : view === 'history' ? (
            <SchedulingClockProvider serverNow={now}>
              <HistoryResults today={today} />
            </SchedulingClockProvider>
          ) : (
            <p>Medications</p>
          )}
        </Toaster>
      </QueryClientProvider>
    )
  }
  render(<App />)
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })
  return {
    user,
    open: (view: View, date = today) =>
      act(() => {
        search = new URLSearchParams(`date=${date}`)
        go(view)
      }),
  }
}

// The open drawer hides the page from the accessibility tree.
const todayRow = async () =>
  within(await screen.findByRole('list', { name: "Today's doses", hidden: true })).getByRole(
    'listitem',
    { hidden: true },
  )
const historyRow = async (date: string) =>
  within(
    await screen.findByRole('list', {
      name: `Doses for ${formatLongDay(date, today)}`,
      hidden: true,
    }),
  ).getByRole('listitem', { hidden: true })

async function correctToSkipped(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Review dose for Morning Tablet/ }))
  await user.click(await screen.findByRole('button', { name: /^Change dose for/ }))
  await user.click(screen.getByRole('button', { name: 'I skipped it' }))
  await user.click(screen.getByRole('button', { name: 'Save as skipped' }))
}

test('a save confirmed on Today shows on its cached History date without a reload', async () => {
  const { dose } = api()
  const app = session({ history: { [today]: [dose(today)] } })
  await app.user.click(
    await screen.findByRole('button', { name: /^Record dose for Morning Tablet/ }),
  )
  await app.user.click(await screen.findByRole('button', { name: 'I took it' }))
  await app.user.click(screen.getByRole('button', { name: 'Save as taken' }))
  expect(await screen.findByText(/Morning Tablet 09:00 · taken at 09:05/)).toBeVisible()
  // Held so the History view shows its cache, not a fresh read.
  server.use(http.get('/api/schedules/history', () => new Promise<Response>(() => {})))
  app.open('history')
  expect(await historyRow(today)).toHaveTextContent('Taken')
  expect(await historyRow(today)).not.toHaveTextContent('Not logged')
})

test('a correction confirmed on History updates Today and its own date without a reload', async () => {
  const { dose } = api({ records: [takenRecord(today)] })
  const app = session({ view: 'history', today: true, history: { [today]: [dose(today)] } })
  await correctToSkipped(app.user)
  expect(await screen.findByText(/Morning Tablet 09:00 · changed to skipped/)).toBeVisible()
  expect(await historyRow(today)).toHaveTextContent('Skipped')
  // Held so Today shows its cached snapshot, not a fresh read.
  server.use(http.get('/api/schedules', () => new Promise<Response>(() => {})))
  app.open('today')
  expect(await todayRow()).toHaveTextContent('Skipped')
})

test('a pending then unconfirmed save shows its badge on both Today and History (FE-674)', async () => {
  const held = deferred()
  const { dose } = api({
    store: false,
    reply: async () => {
      await held.promise
      return HttpResponse.json({}, { status: 503 })
    },
  })
  const app = session({ history: { [today]: [dose(today)] } })
  await app.user.click(
    await screen.findByRole('button', { name: /^Record dose for Morning Tablet/ }),
  )
  await app.user.click(await screen.findByRole('button', { name: 'I took it' }))
  await app.user.click(screen.getByRole('button', { name: 'Save as taken' }))
  expect(await todayRow()).toHaveTextContent('Saving · Taken')
  app.open('history')
  expect(await historyRow(today)).toHaveTextContent('Saving · Taken')
  app.open('today')
  expect(await todayRow()).toHaveTextContent('Saving · Taken')
  app.open('history')
  await act(async () => held.release())
  await waitFor(async () =>
    expect(await historyRow(today)).toHaveTextContent('Might not have saved'),
  )
  app.open('today')
  expect(await todayRow()).toHaveTextContent('Might not have saved')
})

test('a lost History correction response checks that date and confirms without a duplicate', async () => {
  const yesterday = '2026-11-05'
  const { state, dose } = api({
    records: [takenRecord(yesterday)],
    reply: async () => HttpResponse.json({}, { status: 503 }),
  })
  const app = session({
    view: 'history',
    date: yesterday,
    history: { [yesterday]: [dose(yesterday)] },
  })
  await correctToSkipped(app.user)
  expect(await screen.findByText(/Morning Tablet 09:00 · changed to skipped/)).toBeVisible()
  expect(await historyRow(yesterday)).toHaveTextContent('Skipped')
  expect(await historyRow(yesterday)).not.toHaveTextContent('Might not have saved')
  expect(new Set(state.reads.history)).toEqual(new Set([yesterday]))
  expect(state.writes).toHaveLength(1)
})

test('any later read of a past History date confirms its unconfirmed correction once', async () => {
  const yesterday = '2026-11-05'
  const { state, dose } = api({
    records: [takenRecord(yesterday)],
    store: false,
    reply: async () => HttpResponse.json({}, { status: 503 }),
  })
  const app = session({
    view: 'history',
    date: yesterday,
    history: { [yesterday]: [dose(yesterday)] },
  })
  await correctToSkipped(app.user)
  expect(await screen.findByText('That might not have saved.')).toBeVisible()
  await app.user.click(screen.getByRole('button', { name: 'Close dose details' }))
  expect(await historyRow(yesterday)).toHaveTextContent('Might not have saved')
  // The first attempt did reach the server after all.
  state.records = [
    {
      scheduleId: schedule.id,
      dueAt: dueOn(yesterday),
      outcome: 'Skipped',
      recordedAt: now,
      revision: 1,
      actionId: String(state.writes[0].actionId),
    },
  ]
  app.open('medications')
  fireEvent(window, new Event('offline'))
  fireEvent(window, new Event('online'))
  expect(await screen.findByText('Morning Tablet 09:00 · already saved as skipped')).toBeVisible()
  expect(state.reads.history.filter((date) => date === yesterday).length).toBeGreaterThan(1)
  app.open('history', yesterday)
  expect(await historyRow(yesterday)).toHaveTextContent('Skipped')
  expect(await historyRow(yesterday)).not.toHaveTextContent('Might not have saved')
  expect(screen.getAllByText(/already saved as skipped/)).toHaveLength(1)
  expect(state.writes).toHaveLength(1)
})

test('a result with no drawer watching names Today for a dose due today', async () => {
  const held = deferred()
  api({
    store: false,
    reply: async () => {
      await held.promise
      return HttpResponse.json({}, { status: 503 })
    },
  })
  const app = session()
  await app.user.click(
    await screen.findByRole('button', { name: /^Record dose for Morning Tablet/ }),
  )
  await app.user.click(await screen.findByRole('button', { name: 'I took it' }))
  await app.user.click(screen.getByRole('button', { name: 'Save as taken' }))
  app.open('medications')
  await act(async () => held.release())
  expect(
    await screen.findByText('Morning Tablet 09:00 · might not have saved. Open Today to try again'),
  ).toBeVisible()
})

test.each([
  [503, 'might not have saved. Open History for Thu 5 Nov to try again'],
  [409, "not saved. Open History for Thu 5 Nov to check what's saved"],
])(
  'a %i with no drawer watching names the History date of a past dose',
  async (status, message) => {
    const yesterday = '2026-11-05'
    const held = deferred()
    const { dose } = api({
      records: [takenRecord(yesterday)],
      store: false,
      reply: async () => {
        await held.promise
        return HttpResponse.json({}, { status })
      },
    })
    const app = session({
      view: 'history',
      date: yesterday,
      history: { [yesterday]: [dose(yesterday)] },
    })
    await correctToSkipped(app.user)
    app.open('medications')
    await act(async () => held.release())
    expect(await screen.findByText(`Morning Tablet 09:00 · ${message}`)).toBeVisible()
  },
)

test('a definite rejection clears only that save and writes no cache', async () => {
  const yesterday = '2026-11-05'
  const held = deferred()
  const { state, dose } = api({
    records: [takenRecord(yesterday)],
    store: false,
    reply: async (body) => {
      if (body.dueAt === dueOn(yesterday)) return HttpResponse.json({}, { status: 400 })
      await held.promise
      return null
    },
  })
  const history = { [yesterday]: [dose(yesterday)], [today]: [dose(today)] }
  const app = session({ history })
  await app.user.click(
    await screen.findByRole('button', { name: /^Record dose for Morning Tablet/ }),
  )
  await app.user.click(await screen.findByRole('button', { name: 'I took it' }))
  await app.user.click(screen.getByRole('button', { name: 'Save as taken' }))
  app.open('history', yesterday)
  await correctToSkipped(app.user)
  expect(await screen.findByText(/can't be skipped any more/)).toBeVisible()
  expect(await historyRow(yesterday)).toHaveTextContent('Taken')
  expect(await historyRow(yesterday)).not.toHaveTextContent(/Saving|Might not have saved|Skipped/)
  expect(client.getQueryData(scheduleKeys.history(yesterday))).toEqual(history[yesterday])
  // Today's own save is still pending, untouched by the rejection.
  app.open('history', today)
  expect(await historyRow(today)).toHaveTextContent('Saving · Taken')
  await act(async () => held.release())
  await waitFor(async () => expect(await historyRow(today)).toHaveTextContent('Taken 09:05'))
  expect(state.writes).toHaveLength(2)
})

test('a server-streamed History date confirms a matching unconfirmed correction', async () => {
  const yesterday = '2026-11-05'
  const { state, dose } = api({
    records: [takenRecord(yesterday)],
    store: false,
    reply: async () => HttpResponse.json({}, { status: 503 }),
  })
  const app = session({
    view: 'history',
    date: yesterday,
    history: { [yesterday]: [dose(yesterday)] },
  })
  await correctToSkipped(app.user)
  expect(await screen.findByText('That might not have saved.')).toBeVisible()
  await app.user.click(screen.getByRole('button', { name: 'Close dose details' }))
  expect(await historyRow(yesterday)).toHaveTextContent('Might not have saved')
  // The History page streams this date again from the server, now with the first attempt's record.
  state.records = [
    {
      scheduleId: schedule.id,
      dueAt: dueOn(yesterday),
      outcome: 'Skipped',
      recordedAt: now,
      revision: 1,
      actionId: String(state.writes[0].actionId),
    },
  ]
  const streamed = createQueryClient()
  streamed.setQueryData(scheduleKeys.history(yesterday), [dose(yesterday)], {
    updatedAt: Date.now() + 1_000,
  })
  act(() => hydrate(client, dehydrate(streamed)))
  expect(await screen.findByText('Morning Tablet 09:00 · already saved as skipped')).toBeVisible()
  expect(await historyRow(yesterday)).not.toHaveTextContent('Might not have saved')
  expect(state.writes).toHaveLength(1)
  streamed.clear()
})
