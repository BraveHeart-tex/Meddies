import { onlineManager, QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Toaster } from '../src/components/ui/toast'
import type { Medicine } from '../src/features/medicines/contract'
import { medicineKeys } from '../src/features/medicines/queries'
import type { DailySchedule, DoseOutcomeRecord } from '../src/features/schedules/contract'
import { SchedulePanel } from '../src/features/schedules/schedule-panel'
import { TodayHeader } from '../src/features/schedules/today-header'
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
const schedule: DailySchedule = {
  id: '00000000-0000-4000-8000-0000000000a1',
  medicineId: medicine.id,
  startDate: '2026-11-01',
  times: [{ time: '09:00', quantity: 1 }],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  confirmedAt: '2026-10-31T09:00:00.000Z',
}
// 09:05 in Istanbul (UTC+3); the dose was due at 09:00.
const now = '2026-11-14T06:05:00.000Z'
const dueAt = '2026-11-14T06:00:00.000Z'

/** Stored records, schedule reads and PUT bodies; `respond` decides each PUT's reply. */
function api(respond: (body: Record<string, unknown>, count: number) => Promise<Response>) {
  const state = { records: [] as DoseOutcomeRecord[], reads: 0, puts: [] as unknown[] }
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
    http.get('/api/schedules', () => {
      state.reads++
      return HttpResponse.json({
        schedules: [schedule],
        records: state.records,
        today: { now, date: '2026-11-14' },
      })
    }),
    http.put('/api/schedules', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      state.puts.push(body)
      return respond(body, state.puts.length)
    }),
  )
  return state
}

const taken = (body: Record<string, unknown>): DoseOutcomeRecord =>
  ({ ...body, revision: 0 }) as DoseOutcomeRecord

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
})

afterEach(() => {
  client.clear()
  onlineManager.setOnline(true)
})

/** One session: the Toast host stays while Today mounts and unmounts like a route. */
function session() {
  let showToday!: (show: boolean) => void
  function App() {
    const [today, setToday] = useState(true)
    showToday = setToday
    return (
      <QueryClientProvider client={client}>
        <Toaster>
          {today ? (
            <>
              <TodayHeader initialNow={now} />
              <SchedulePanel mode="today" initialNow={now} />
            </>
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
    leave: () => act(() => showToday(false)),
    back: () => act(() => showToday(true)),
  }
}
// The open drawer hides the page from the accessibility tree.
const row = async () =>
  within(await screen.findByRole('list', { name: "Today's doses", hidden: true })).getByRole(
    'listitem',
    { hidden: true },
  )

async function recordTaken(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Record dose for Morning Tablet/ }))
  await user.click(await screen.findByRole('button', { name: 'I took it' }))
}

test('leaving Today keeps a pending save going and its confirmation reaches the user', async () => {
  const held = deferred()
  const state = api(async (body) => {
    await held.promise
    state.records = [taken(body)]
    return HttpResponse.json({ record: taken(body) })
  })
  const app = session()
  await recordTaken(app.user)
  await app.user.click(screen.getByRole('button', { name: 'Save as taken' }))
  expect(await row()).toHaveTextContent('Saving · Taken')
  app.leave()
  expect(screen.getByText('Medications')).toBeVisible()
  await act(async () => held.release())
  expect(await screen.findByText(/Morning Tablet 09:00 · taken at 09:05/)).toBeVisible()
  expect(state.puts).toHaveLength(1)
  app.back()
  expect(await row()).toHaveTextContent('Taken')
  expect(await row()).not.toHaveTextContent('Saving')
})

test('a closed unconfirmed save keeps its badge across navigation and retries the same request', async () => {
  const state = api(async (body, count) => {
    if (count === 1) return HttpResponse.json({}, { status: 503 })
    state.records = [taken(body)]
    return HttpResponse.json({ record: taken(body) })
  })
  const app = session()
  await recordTaken(app.user)
  const amount = screen.getByLabelText(/^Amount/)
  await app.user.clear(amount)
  await app.user.type(amount, '2')
  await app.user.click(screen.getByRole('button', { name: 'Save as taken' }))
  expect(await screen.findByText('That might not have saved.')).toBeVisible()
  await app.user.click(screen.getByRole('button', { name: 'Close dose details' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(await row()).toHaveTextContent('Might not have saved')
  expect(await row()).toHaveTextContent(
    'Taken at 09:05, 2 tablets · might not have saved · open to try again',
  )
  app.leave()
  await vi.advanceTimersByTimeAsync(2 * 60_000)
  app.back()
  expect(await row()).toHaveTextContent('Might not have saved')
  await app.user.click(screen.getByRole('button', { name: /^Record dose for Morning Tablet/ }))
  expect(await screen.findByLabelText(/^Amount/)).toHaveValue('2')
  await app.user.click(screen.getByRole('button', { name: 'Try saving as taken again' }))
  expect(await screen.findByText(/Morning Tablet 09:00 · taken at 09:05/)).toBeVisible()
  expect(state.puts).toHaveLength(2)
  expect(state.puts[1]).toEqual(state.puts[0])
})

test('focus and reconnect recheck an unconfirmed save; a found record confirms once', async () => {
  const state = api(async () => HttpResponse.json({}, { status: 503 }))
  const app = session()
  await recordTaken(app.user)
  await app.user.click(screen.getByRole('button', { name: 'Save as taken' }))
  expect(await screen.findByText('That might not have saved.')).toBeVisible()
  await app.user.click(screen.getByRole('button', { name: 'Close dose details' }))
  app.leave()
  const reads = state.reads
  fireEvent(window, new FocusEvent('focus'))
  await waitFor(() => expect(state.reads).toBe(reads + 1))
  app.back()
  expect(await row()).toHaveTextContent('Might not have saved')
  state.records = [taken(state.puts[0] as Record<string, unknown>)]
  app.leave()
  fireEvent(window, new Event('offline'))
  fireEvent(window, new Event('online'))
  expect(
    await screen.findByText(/Morning Tablet 09:00 · already saved as taken at 09:05/),
  ).toBeVisible()
  await waitFor(() => expect(state.reads).toBe(reads + 2))
  // Nothing is left to recheck, so returning to the page away from Today reads nothing more.
  // (A window focus event with a Toast open trips Base UI's viewport check in jsdom.)
  fireEvent(window, new Event('visibilitychange'))
  await act(() => vi.advanceTimersByTimeAsync(1_000))
  expect(state.reads).toBe(reads + 2)
  expect(screen.getAllByText(/already saved as taken/)).toHaveLength(1)
  app.back()
  expect(await row()).toHaveTextContent('Taken')
  expect(await row()).not.toHaveTextContent('Might not have saved')
  expect(state.puts).toHaveLength(1)
})

test('a record made elsewhere while the drawer is open keeps the draft and saves nothing', async () => {
  const state = api(async () => HttpResponse.json({}, { status: 409 }))
  const app = session()
  await recordTaken(app.user)
  const amount = screen.getByLabelText(/^Amount/)
  await app.user.clear(amount)
  await app.user.type(amount, '2')
  state.records = [
    { scheduleId: schedule.id, dueAt, outcome: 'Taken', takenAt: dueAt, quantity: 1, revision: 0 },
  ]
  fireEvent(window, new FocusEvent('focus'))
  expect(
    await screen.findByText(
      "This dose was saved as taken at 09:00 while your form was open. Your details are still here. Check what's saved before you save again.",
    ),
  ).toBeVisible()
  expect(amount).toHaveValue('2')
  expect(state.puts).toHaveLength(0)
})

test('unsaved drawer details survive navigation; explicit dismissal discards them', async () => {
  api(async () => HttpResponse.json({}, { status: 503 }))
  const app = session()
  await recordTaken(app.user)
  const amount = screen.getByLabelText(/^Amount/)
  await app.user.clear(amount)
  await app.user.type(amount, '3')
  app.leave()
  app.back()
  const dialog = await screen.findByRole('dialog', { name: 'Morning Tablet' })
  expect(within(dialog).getByRole('button', { name: 'I took it' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(within(dialog).getByLabelText(/^Amount/)).toHaveValue('3')
  await app.user.click(within(dialog).getByRole('button', { name: 'Close dose details' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  app.leave()
  app.back()
  await row()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await recordTaken(app.user)
  expect(screen.getByLabelText(/^Amount/)).toHaveValue('1')
})

test('a different record for a closed unconfirmed save replaces its badge with explicit review', async () => {
  const state = api(async () => HttpResponse.json({}, { status: 503 }))
  const app = session()
  await recordTaken(app.user)
  await app.user.click(screen.getByRole('button', { name: 'Save as taken' }))
  expect(await screen.findByText('That might not have saved.')).toBeVisible()
  await app.user.click(screen.getByRole('button', { name: 'Close dose details' }))
  expect(await row()).toHaveTextContent('Might not have saved')
  state.records = [
    { scheduleId: schedule.id, dueAt, outcome: 'Skipped', recordedAt: now, revision: 0 },
  ]
  fireEvent(window, new FocusEvent('focus'))
  await waitFor(async () => expect(await row()).not.toHaveTextContent('Might not have saved'))
  expect(await row()).toHaveTextContent('Skipped')
  await app.user.click(within(await row()).getByRole('button', { name: "Check what's saved" }))
  expect(await row()).not.toHaveTextContent("Check what's saved")
  expect(state.puts).toHaveLength(1)
})
