import { onlineManager, QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
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

/** Render the real Today drawer and session Toast host. */
function session() {
  function App() {
    return (
      <QueryClientProvider client={client}>
        <Toaster>
          <TodayHeader initialNow={now} />
          <SchedulePanel mode="today" initialNow={now} />
        </Toaster>
      </QueryClientProvider>
    )
  }
  render(<App />)
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })
  return {
    user,
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
  await waitFor(() => expect(screen.getByRole('heading', { name: medicine.label })).toHaveFocus())
  await user.click(await screen.findByRole('button', { name: 'I took it' }))
}

async function pickTime(user: ReturnType<typeof userEvent.setup>, time: string) {
  for (const [part, value] of [
    ['hour', time.slice(0, 2)],
    ['minute', time.slice(3)],
  ] as const) {
    await user.click(screen.getByRole('combobox', { name: `Taken time in Istanbul ${part}` }))
    await user.click(await screen.findByRole('option', { name: value }))
  }
}

test('inline errors focus the first invalid control, keep values and accept half tablets', async () => {
  const state = api(async (body) => {
    state.records = [taken(body)]
    return HttpResponse.json({ record: taken(body) })
  })
  const { user } = session()
  await recordTaken(user)
  expect(screen.getByRole('dialog', { name: medicine.label })).toHaveTextContent(
    /Scheduled 09:00 today/,
  )
  expect(screen.getByRole('button', { name: 'Now · 09:05' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const amount = screen.getByLabelText(/^Amount/)
  await user.clear(amount)
  await user.click(screen.getByRole('button', { name: 'Other' }))
  await user.click(screen.getByRole('button', { name: /^Taken date in Istanbul,/ }))
  await user.click(screen.getByRole('button', { name: /Saturday, November 14/ }))
  await pickTime(user, '10:00')
  await user.click(screen.getByRole('button', { name: 'Save as taken' }))
  expect(await screen.findByText('Choose a time that has passed.')).toBeVisible()
  expect(screen.getByText('Enter a quantity.')).toBeVisible()
  expect(amount).toHaveAttribute('aria-invalid', 'true')
  expect(amount).toHaveValue('')
  expect(screen.getByRole('combobox', { name: /hour$/ })).toHaveFocus()
  await pickTime(user, '08:30')
  await waitFor(() =>
    expect(screen.queryByText('Choose a time that has passed.')).not.toBeInTheDocument(),
  )
  await user.type(amount, '1.25')
  expect(await screen.findByText('Use whole or half tablets.')).toBeVisible()
  await user.clear(amount)
  await user.type(amount, '1½')
  await waitFor(() =>
    expect(screen.queryByText('Use whole or half tablets.')).not.toBeInTheDocument(),
  )
  await user.click(screen.getByRole('button', { name: 'Save as taken' }))
  expect(await screen.findByText('Morning Tablet 09:00 · taken at 08:30, 1½ tablets')).toBeVisible()
  expect(state.puts[0]).toMatchObject({ takenAt: '2026-11-14T05:30:00.000Z', quantity: 1.5 })
  expect(await row()).toHaveTextContent('Taken')
  expect(screen.queryByRole('dialog', { name: medicine.label })).not.toBeInTheDocument()
})

test.each([false, true])(
  'an unconfirmed save retains details; edited=%s determines attempt identity',
  async (edited) => {
    const state = api(async (body, count) => {
      if (count === 1) return HttpResponse.error()
      state.records = [taken(body)]
      return HttpResponse.json({ record: taken(body) })
    })
    const { user } = session()
    await recordTaken(user)
    const amount = screen.getByLabelText(/^Amount/)
    await user.clear(amount)
    await user.type(amount, '1½')
    await user.click(screen.getByRole('button', { name: 'Save as taken' }))
    expect(await screen.findByText('That might not have saved.')).toBeVisible()
    expect(await screen.findByText(/Meddies checked and can't find it yet/)).toBeVisible()
    expect(await row()).toHaveTextContent('Might not have saved')
    expect(amount).toHaveValue('1½')
    await user.clear(amount)
    await user.type(amount, '2')
    expect(screen.getByText(/Changing details starts a new save/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save as taken' })).toBeVisible()
    if (!edited) {
      await user.clear(amount)
      await user.type(amount, '1.5')
    }
    await user.click(
      screen.getByRole('button', { name: edited ? 'Save as taken' : 'Try saving as taken again' }),
    )
    expect(
      await screen.findByText(
        new RegExp(`Morning Tablet 09:00 · taken at 09:05, ${edited ? '2' : '1½'} tablets`),
      ),
    ).toBeVisible()
    expect(state.puts).toHaveLength(2)
    if (edited) {
      expect(state.puts[1]).not.toHaveProperty(
        'actionId',
        (state.puts[0] as Record<string, unknown>).actionId,
      )
      expect(state.puts[1]).toMatchObject({ quantity: 2 })
    } else expect(state.puts[1]).toEqual(state.puts[0])
    expect(await row()).toHaveTextContent('Taken')
    expect(screen.queryByRole('dialog', { name: medicine.label })).not.toBeInTheDocument()
  },
)

test('a stored save with a lost response is found by the check without another save', async () => {
  const state = api(async (body) => {
    state.records = [taken(body)]
    return HttpResponse.error()
  })
  const { user } = session()
  await recordTaken(user)
  await user.click(screen.getByRole('button', { name: 'Save as taken' }))
  expect(await screen.findByText('Morning Tablet 09:00 · taken at 09:05, 1 tablet')).toBeVisible()
  expect(screen.queryByText(/was already recorded/)).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: medicine.label })).not.toBeInTheDocument()
  expect(await row()).toHaveTextContent('Taken')
  expect(state.puts).toHaveLength(1)
  expect(state.reads).toBeGreaterThan(1)
})

test('a synchronous double submit sends one save', async () => {
  const held = deferred()
  const state = api(async (body) => {
    await held.promise
    state.records = [taken(body)]
    return HttpResponse.json({ record: taken(body) })
  })
  const { user } = session()
  await recordTaken(user)
  const save = screen.getByRole('button', { name: 'Save as taken' })
  act(() => {
    fireEvent.click(save)
    fireEvent.click(save)
  })
  await waitFor(() => expect(state.puts).toHaveLength(1))
  await act(async () => held.release())
  expect(await screen.findByText('Morning Tablet 09:00 · taken at 09:05, 1 tablet')).toBeVisible()
  expect(state.puts).toHaveLength(1)
})

const preciseTakenAt = '2026-11-14T06:01:42.123Z'
function recordedApi() {
  const state = api(async () => HttpResponse.json({}, { status: 400 }))
  state.records = [
    {
      scheduleId: schedule.id,
      dueAt,
      outcome: 'Taken',
      takenAt: preciseTakenAt,
      quantity: 1,
      revision: 0,
    },
  ]
  return state
}

test.each(['edit', 'correct'] as const)(
  'a stale %s keeps the server outcome, returns focus and permits correction after review',
  async (mode) => {
    const state = recordedApi()
    const patches: Record<string, unknown>[] = []
    server.use(
      http.patch('/api/schedules', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        patches.push(body)
        if (patches.length === 1) {
          state.records = [
            {
              scheduleId: schedule.id,
              dueAt,
              outcome: 'Taken',
              takenAt: preciseTakenAt,
              quantity: 3,
              revision: 1,
            },
          ]
          return HttpResponse.json({}, { status: 409 })
        }
        const record = { ...body, recordedAt: now, revision: 2 }
        state.records = [record as unknown as DoseOutcomeRecord]
        return HttpResponse.json({ record })
      }),
    )
    const { user } = session()
    const trigger = await screen.findByRole('button', { name: /^Review dose for Morning Tablet/ })
    await user.click(trigger)
    await user.click(
      screen.getByRole('button', { name: mode === 'edit' ? /^Edit dose for/ : /^Change dose for/ }),
    )
    if (mode === 'edit') {
      const amount = screen.getByLabelText(/^Amount/)
      await user.clear(amount)
      await user.type(amount, '2')
    } else await user.click(screen.getByRole('button', { name: 'I skipped it' }))
    await user.click(
      screen.getByRole('button', { name: mode === 'edit' ? 'Save changes' : 'Save as skipped' }),
    )
    expect(
      await screen.findByText(
        "This dose changed somewhere else, so your change didn't save. Check what's saved now before changing it again.",
      ),
    ).toBeVisible()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: medicine.label })).not.toBeInTheDocument(),
    )
    expect(await row()).toHaveTextContent('took 3 tablets')
    expect(await row()).not.toHaveTextContent('Skipped')
    expect(await row()).toHaveTextContent("so your change didn't save")
    await waitFor(() => expect(trigger).toHaveFocus())
    await user.click(screen.getByRole('button', { name: "Check what's saved" }))
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: medicine.label })).toHaveTextContent(
      'Taken 3 tablets',
    )
    await user.click(screen.getByRole('button', { name: /^Change dose for/ }))
    await user.click(screen.getByRole('button', { name: 'I skipped it' }))
    await user.click(screen.getByRole('button', { name: 'Save as skipped' }))
    await waitFor(async () => expect(await row()).toHaveTextContent('Skipped'))
    expect(patches).toHaveLength(2)
    expect(patches[0]).toMatchObject({ expectedRevision: 0, expectedOutcome: 'Taken' })
    expect(patches[1]).toMatchObject({
      expectedRevision: 1,
      expectedOutcome: 'Taken',
      outcome: 'Skipped',
    })
  },
)

test('editing only the amount preserves the exact recorded instant', async () => {
  const state = recordedApi()
  const patches: Record<string, unknown>[] = []
  server.use(
    http.patch('/api/schedules', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      patches.push(body)
      const record = { ...body, revision: 1 } as unknown as DoseOutcomeRecord
      state.records = [record]
      return HttpResponse.json({ record })
    }),
  )
  const { user } = session()
  await user.click(await screen.findByRole('button', { name: /^Review dose for Morning Tablet/ }))
  await user.click(screen.getByRole('button', { name: /^Edit dose for/ }))
  const amount = screen.getByLabelText(/^Amount/)
  expect(amount).toHaveValue('1')
  await user.clear(amount)
  await user.type(amount, '2')
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(
    await screen.findByText('Morning Tablet 09:00 · updated to taken at 09:01, 2 tablets'),
  ).toBeVisible()
  expect(await row()).toHaveTextContent('took 2 tablets')
  expect(patches).toHaveLength(1)
  expect(patches[0]).toMatchObject({ takenAt: preciseTakenAt, quantity: 2 })
  expect((await row()).querySelector(`time[datetime="${preciseTakenAt}"]`)).toBeVisible()
})
