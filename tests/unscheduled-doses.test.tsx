import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Toaster } from '../src/components/ui/toast'
import type { Medicine } from '../src/features/medicines/contract'
import { MedicinePanel } from '../src/features/medicines/medicine-panel'
import type {
  DailySchedule,
  DoseOccurrence,
  DoseOutcomeRecord,
} from '../src/features/schedules/contract'
import { HistoryDay } from '../src/features/schedules/history-day'
import { scheduleHistoryDay, scheduleToday } from '../src/features/schedules/occurrences'
import { SchedulePanel } from '../src/features/schedules/schedule-panel'
import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import type { UnscheduledDose } from '../src/features/unscheduled-doses/contract'
import { unscheduledKeys } from '../src/features/unscheduled-doses/queries'
import { istanbulDate } from '../src/lib/calendar-date'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

// 10:00 on Saturday 14 November in Istanbul.
const now = '2026-11-14T07:00:00.000Z'
const TODAY = '2026-11-14'
const YESTERDAY = '2026-11-13'
const magnesium: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Magnesium',
  strength: null,
  unit: 'tablet',
}
const ibuprofen: Medicine = {
  id: '00000000-0000-4000-8000-000000000002',
  label: 'Ibuprofen',
  strength: '200 mg',
  unit: 'tablet',
}
const schedule: DailySchedule = {
  id: '00000000-0000-4000-8000-0000000000a1',
  medicineId: magnesium.id,
  startDate: '2026-11-01',
  times: [
    { time: '08:00', quantity: 1 },
    { time: '20:00', quantity: 1 },
  ],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  confirmedAt: '2026-10-31T09:00:00.000Z',
}
// 08:00 taken at 08:05.
const morning: DoseOutcomeRecord = {
  outcome: 'Taken',
  scheduleId: schedule.id,
  dueAt: '2026-11-14T05:00:00.000Z',
  takenAt: '2026-11-14T05:05:00.000Z',
  quantity: 1,
  revision: 0,
}
const dose = (n: number, takenAt: string, quantity = 1): UnscheduledDose => ({
  id: `77777777-7777-4777-8777-${String(n).padStart(12, '0')}`,
  actionId: `88888888-8888-4888-8888-${String(n).padStart(12, '0')}`,
  medicineId: ibuprofen.id,
  takenAt,
  quantity,
  outcome: 'Taken',
  revision: 0,
  removed: false,
})
// 09:30 today.
const morningIbuprofen = dose(1, '2026-11-14T06:30:00.000Z')

type Reply = 'ok' | 'lost' | 'reject'

/**
 * A fake server keeping each Unscheduled dose's latest revision. An action ID it has seen
 * returns the saved dose, as the Worker does. `replies` answers each write in turn; 'lost'
 * stores the write and loses the response.
 */
function api({
  schedules = [schedule],
  records = [morning],
  doses = [morningIbuprofen],
  replies = [] as Reply[],
} = {}) {
  const state = { doses: [...doses], writes: [] as Record<string, unknown>[] }
  const day = (date: string) =>
    state.doses.filter((item) => !item.removed && istanbulDate(new Date(item.takenAt)) === date)
  const write = (body: Record<string, unknown>) => {
    state.writes.push(body)
    const reply = replies.shift() ?? 'ok'
    if (reply === 'reject') return HttpResponse.json({ error: 'validation' }, { status: 400 })
    let saved = state.doses.find((item) => item.actionId === body.actionId)
    if (!saved) {
      const current = state.doses.find((item) => item.id === body.doseId)
      saved = current
        ? {
            ...current,
            actionId: String(body.actionId),
            revision: current.revision + 1,
            removed: Boolean(body.removed),
            ...(body.removed
              ? {}
              : { takenAt: String(body.takenAt), quantity: Number(body.quantity) }),
          }
        : {
            id: String(body.actionId),
            actionId: String(body.actionId),
            medicineId: String(body.medicineId),
            takenAt: String(body.takenAt),
            quantity: Number(body.quantity),
            outcome: 'Taken',
            revision: 0,
            removed: false,
          }
      state.doses = [...state.doses.filter((item) => item.id !== saved!.id), saved]
    }
    return reply === 'lost' ? HttpResponse.error() : HttpResponse.json({ dose: saved })
  }
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [magnesium, ibuprofen] })),
    http.get('/api/schedules', () =>
      HttpResponse.json({
        schedules,
        records,
        unscheduledDoses: day(TODAY),
        today: scheduleToday(schedules, new Date(now), records),
      }),
    ),
    http.post('/api/schedules/unscheduled', async ({ request }) =>
      write((await request.json()) as Record<string, unknown>),
    ),
    http.patch('/api/schedules/unscheduled', async ({ request }) =>
      write((await request.json()) as Record<string, unknown>),
    ),
  )
  return state
}

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
})
afterEach(() => client.clear())

function renderToday() {
  render(
    <QueryClientProvider client={client}>
      <Toaster>
        <SchedulePanel mode="today" initialNow={now} />
      </Toaster>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

function renderDetail(medicine = ibuprofen) {
  window.history.replaceState(null, '', `/medications?medicine=${medicine.id}`)
  render(
    <QueryClientProvider client={client}>
      <Toaster>
        <MedicinePanel scheduleMode="detail" detailMedicineId={medicine.id} initialNow={now} />
      </Toaster>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

// The open drawer hides the page from the accessibility tree.
const rows = async () =>
  within(await screen.findByRole('list', { name: "Today's doses", hidden: true }))
    .getAllByRole('listitem', { hidden: true })
    .map((row) => row.textContent ?? '')

async function pickTime(user: ReturnType<typeof userEvent.setup>, time: string) {
  for (const [part, value] of [
    ['hour', time.slice(0, 2)],
    ['minute', time.slice(3)],
  ] as const) {
    await user.click(screen.getByRole('combobox', { name: `Taken time in Istanbul ${part}` }))
    await user.click(await screen.findByRole('option', { name: value }))
  }
}

test('Today lists an Unscheduled dose in Logged by its taken time, marked and never next', async () => {
  api()
  renderToday()
  // Later today's 20:00, then Logged: 08:00 by due time, 09:30 by taken time.
  await waitFor(async () => expect(await rows()).toHaveLength(3))
  const shown = await rows()
  expect(shown[0]).toMatch(/^20:00.*Magnesium/)
  expect(shown[1]).toMatch(/^08:00.*Magnesium/)
  expect(shown[2]).toMatch(/^09:30.*Ibuprofen.*200 mg · 1 tablet · Not on a schedule.*Taken/)
  expect(screen.getByRole('heading', { name: 'Logged · 2' })).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'Up next' }).closest('[data-slot=card]'),
  ).toHaveTextContent('Magnesium')
})

test('a Today with only Unscheduled doses lists them instead of its empty state', async () => {
  api({
    schedules: [],
    records: [],
    doses: [morningIbuprofen, dose(2, '2026-11-14T04:15:00.000Z', 2)],
  })
  renderToday()
  expect(await screen.findByRole('heading', { name: 'Logged · 2' })).toBeVisible()
  expect((await rows())[0]).toMatch(/^07:15.*2 tablets/)
  expect(screen.queryByText('No doses to show yet')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Up next' })).not.toBeInTheDocument()
})

test('History shows Unscheduled doses in time order and counts scheduled doses only', () => {
  const doses = scheduleHistoryDay([schedule], YESTERDAY, new Date(now), [])
  client.setQueryData(unscheduledKeys.day(YESTERDAY), [
    dose(3, '2026-11-13T20:30:00.000Z', 0.5),
    dose(4, '2026-11-13T12:10:00.000Z'),
    // Taken today, so it belongs to today's History date.
    morningIbuprofen,
  ])
  render(
    <QueryClientProvider client={client}>
      <SchedulingClockProvider serverNow={now}>
        <HistoryDay
          date={YESTERDAY}
          today={TODAY}
          result={{
            status: 'loaded',
            doses: doses as DoseOccurrence[],
            medicines: [magnesium, ibuprofen],
          }}
        />
      </SchedulingClockProvider>
    </QueryClientProvider>,
  )
  const shown = within(screen.getByRole('list', { name: /^Doses for/ }))
    .getAllByRole('listitem')
    .map((row) => row.textContent ?? '')
  expect(shown).toHaveLength(4)
  expect(shown.map((row) => row.slice(0, 5))).toEqual(['08:00', '15:10', '20:00', '23:30'])
  expect(shown[3]).toMatch(/Ibuprofen.*½ tablet · Not on a schedule/)
  expect(screen.getByText('0 of 2 logged')).toBeVisible()
})

test('Log a dose sits under the schedule with or without one and lists no past doses', async () => {
  api()
  const user = renderDetail()
  expect(await screen.findByRole('heading', { name: 'No schedule yet' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Log a dose' })).toBeVisible()
  expect(screen.queryByText(/Not on a schedule/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Log a dose' }))
  const drawer = await screen.findByRole('dialog', { name: 'Ibuprofen' })
  expect(drawer).toHaveTextContent('Not on a schedule')
  expect(within(drawer).getByRole('button', { name: 'Now · 10:00' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(within(drawer).queryByRole('button', { name: /^At / })).not.toBeInTheDocument()
  expect(within(drawer).getByLabelText(/^Amount/)).toHaveValue('1')
})

test('Log a dose shows field errors, then saves another minute yesterday and names the day', async () => {
  const state = api()
  const user = renderDetail()
  await user.click(await screen.findByRole('button', { name: 'Log a dose' }))
  await screen.findByRole('dialog', { name: 'Ibuprofen' })
  await user.click(screen.getByRole('button', { name: 'Other' }))
  const days = within(screen.getByRole('group', { name: 'Taken date' })).getAllByRole('button')
  expect(days.map((day) => [day.textContent, day.getAttribute('aria-label')])).toEqual([
    ['Fri 13 Nov', 'Friday, 13 November'],
    ['Sat 14 Nov', 'Saturday, 14 November'],
  ])
  // A new log saves only once a day is chosen.
  await user.click(screen.getByRole('button', { name: 'Save dose' }))
  expect(await screen.findByText('Choose a date.')).toBeVisible()
  expect(state.writes).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Saturday, 14 November' }))
  await pickTime(user, '11:00')
  await user.click(screen.getByRole('button', { name: 'Save dose' }))
  expect(await screen.findByText('Choose a time that has passed.')).toBeVisible()
  expect(screen.getByRole('combobox', { name: /hour$/ })).toHaveFocus()
  expect(state.writes).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Friday, 13 November' }))
  await pickTime(user, '23:30')
  await user.click(screen.getByLabelText('Fewer: Amount'))
  await user.click(screen.getByRole('button', { name: 'Save dose' }))
  expect(
    await screen.findByText('Ibuprofen · taken at 23:30 on Fri 13 Nov, ½ tablet'),
  ).toBeVisible()
  expect(state.writes[0]).toMatchObject({
    medicineId: ibuprofen.id,
    takenAt: '2026-11-13T20:30:00.000Z',
    quantity: 0.5,
  })
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Ibuprofen' })).not.toBeInTheDocument(),
  )
})

test('a lost response keeps the details and retries the same attempt, so one dose is saved', async () => {
  const state = api({ doses: [], replies: ['lost', 'ok'] })
  const user = renderDetail()
  await user.click(await screen.findByRole('button', { name: 'Log a dose' }))
  await user.click(await screen.findByRole('button', { name: 'Save dose' }))
  const drawer = await screen.findByRole('dialog', { name: 'Ibuprofen' })
  expect(await within(drawer).findByText('That might not have saved.')).toBeVisible()
  expect(drawer).toHaveTextContent('Might not have saved')
  await user.click(within(drawer).getByRole('button', { name: 'Try saving the dose again' }))
  expect(await screen.findByText('Ibuprofen · taken at 10:00, 1 tablet')).toBeVisible()
  expect(state.writes).toHaveLength(2)
  expect(state.writes[1]).toEqual(state.writes[0])
  expect(state.doses).toHaveLength(1)
})

test('a rejected save shows Not saved and keeps the drawer open', async () => {
  api({ replies: ['reject'] })
  const user = renderDetail()
  await user.click(await screen.findByRole('button', { name: 'Log a dose' }))
  await user.click(await screen.findByRole('button', { name: 'Save dose' }))
  const drawer = await screen.findByRole('dialog', { name: 'Ibuprofen' })
  expect(await within(drawer).findByText('Not saved.')).toBeVisible()
  expect(within(drawer).getByRole('button', { name: 'Save dose' })).toBeEnabled()
})

test('changing an Unscheduled dose from Today saves the new intake and says so', async () => {
  const state = api()
  const user = renderToday()
  await user.click(
    await screen.findByRole('button', {
      name: 'Review dose for Ibuprofen taken at 09:30, not on a schedule',
    }),
  )
  const drawer = await screen.findByRole('dialog', { name: 'Ibuprofen' })
  expect(drawer).toHaveTextContent(/Not on a schedule · today.*Taken 09:30/)
  expect(within(drawer).getByRole('button', { name: 'Other' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // A change starts on its saved day; the other choice is yesterday.
  expect(within(drawer).getByRole('button', { name: 'Saturday, 14 November' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(within(drawer).getByRole('button', { name: 'Friday, 13 November' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await pickTime(user, '09:15')
  await user.click(within(drawer).getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByText('Ibuprofen · changed to taken at 09:15, 1 tablet')).toBeVisible()
  expect(state.writes[0]).toMatchObject({
    doseId: morningIbuprofen.id,
    expectedRevision: 0,
    removed: false,
    takenAt: '2026-11-14T06:15:00.000Z',
    quantity: 1,
  })
  await waitFor(async () => expect((await rows())[2]).toMatch(/^09:15.*Ibuprofen/))
})

test('Remove dose asks first, then the dose leaves Today with its Toast', async () => {
  const state = api()
  const user = renderToday()
  await user.click(
    await screen.findByRole('button', {
      name: 'Review dose for Ibuprofen taken at 09:30, not on a schedule',
    }),
  )
  const drawer = await screen.findByRole('dialog', { name: 'Ibuprofen' })
  await user.click(within(drawer).getByRole('button', { name: 'Remove dose' }))
  expect(drawer).toHaveTextContent('Remove this dose?1 tablet at 09:30 leaves Today and History.')
  await user.click(within(drawer).getByRole('button', { name: 'Keep dose' }))
  expect(within(drawer).getByRole('button', { name: 'Save changes' })).toBeVisible()
  expect(state.writes).toHaveLength(0)
  await user.click(within(drawer).getByRole('button', { name: 'Remove dose' }))
  await user.click(within(drawer).getByRole('button', { name: 'Remove dose' }))
  expect(await screen.findByText('Ibuprofen 09:30 · dose removed')).toBeVisible()
  expect(state.writes[0]).toEqual(
    expect.objectContaining({ doseId: morningIbuprofen.id, expectedRevision: 0, removed: true }),
  )
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: /^Review dose for Ibuprofen/ }),
    ).not.toBeInTheDocument(),
  )
  expect(screen.getByRole('heading', { name: 'Logged · 1' })).toBeVisible()
  // The row and its drawer are gone, so focus lands on Today's heading.
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Your doses' })).toHaveFocus())
})
