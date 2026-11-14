import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import type { DoseOccurrence } from '../src/features/schedules/contract'
import { dayHeadingId, HistoryDateNav } from '../src/features/schedules/history-date-nav'
import { HistoryDay } from '../src/features/schedules/history-day'
import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import { createQueryClient } from '../src/lib/session-query-client'

let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
  usePathname: () => '/history',
}))

// Date changes use the native History API, so the results read the dated query (#132).
const push = vi.spyOn(window.history, 'pushState')
const pushed = () => push.mock.lastCall?.[2]
beforeEach(() => {
  push.mockReset()
  search = new URLSearchParams()
})

test('Previous day and Next day push the neighbouring dates', async () => {
  search = new URLSearchParams('date=2026-11-01')
  render(<HistoryDateNav today="2026-11-06" />)
  await userEvent.click(screen.getByRole('button', { name: 'Previous day' }))
  expect(pushed()).toBe('/history?date=2026-10-31')
  // Steps from the date shown, so Next day returns to 1 November.
  await userEvent.click(screen.getByRole('button', { name: 'Next day' }))
  expect(pushed()).toBe('/history?date=2026-11-01')
})

test('Next day is disabled on today', () => {
  render(<HistoryDateNav today="2026-11-06" />)
  expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Previous day' })).toBeEnabled()
})

test('picking a date pushes it', async () => {
  render(<HistoryDateNav today="2026-11-06" />)
  await userEvent.click(screen.getByRole('button', { name: /Choose a date/ }))
  await userEvent.click(document.querySelector<HTMLElement>('button[data-day="2026-11-03"]')!)
  expect(pushed()).toBe('/history?date=2026-11-03')
})

test('the calendar names its month, columns and days in the central formats', async () => {
  render(<HistoryDateNav today="2026-11-06" />)
  await userEvent.click(screen.getByRole('button', { name: /Choose a date/ }))
  expect(screen.getByRole('grid', { name: 'November 2026' })).toBeVisible()
  expect(screen.getByText('November 2026')).toBeVisible()
  // The library hides the header row from the accessibility tree.
  expect(screen.getByRole('columnheader', { name: 'Monday', hidden: true })).toHaveTextContent(
    'Mon',
  )
  expect(screen.getByRole('button', { name: 'Friday, 6 November, today, selected' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Tuesday, 3 November' })).toBeVisible()
})

const medicine: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Melatonin',
  strength: '3 mg',
  unit: 'tablet',
}
const scheduleId = '00000000-0000-4000-8000-000000000002'
const occurrence = (time: string, rest: Partial<DoseOccurrence> = {}) =>
  ({
    id: `${scheduleId}:${time}`,
    scheduleId,
    medicineId: medicine.id,
    dueAt: new Date(`2026-11-05T${time}:00+03:00`).toISOString(),
    quantity: 1,
    status: 'Not logged',
    ...rest,
  }) as DoseOccurrence

function renderDay(props: Partial<Parameters<typeof HistoryDay>[0]> = {}) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <SchedulingClockProvider serverNow="2026-11-06T09:00:00.000Z">
        <HistoryDay
          date="2026-11-05"
          today="2026-11-06"
          result={{ status: 'loaded', doses: [], medicines: [medicine] }}
          {...props}
        />
      </SchedulingClockProvider>
    </QueryClientProvider>,
  )
}

test('a populated day lists doses in time order; every row opens the dose drawer', () => {
  const late = occurrence('22:30', {
    status: 'Taken',
    record: {
      scheduleId,
      dueAt: new Date('2026-11-05T22:30:00+03:00').toISOString(),
      outcome: 'Taken',
      takenAt: new Date('2026-11-06T00:10:00+03:00').toISOString(),
      quantity: 2,
      revision: 1,
    },
  } as Partial<DoseOccurrence>)
  renderDay({
    result: { status: 'loaded', doses: [occurrence('08:00'), late], medicines: [medicine] },
  })
  expect(screen.getByRole('heading', { name: 'Thursday, 5 November, 2 doses' })).toBeVisible()
  expect(screen.getByText('1 of 2 logged')).toBeVisible()
  const [unlogged, taken] = within(
    screen.getByRole('list', { name: 'Doses for Thursday, 5 November' }),
  ).getAllByRole('listitem')
  expect(unlogged).toHaveTextContent('Not logged')
  expect(
    within(unlogged).getByRole('button', {
      name: 'Record dose for Melatonin scheduled at 08:00 on Thu 5 Nov',
    }),
  ).toBeVisible()
  expect(
    within(taken).getByRole('button', {
      name: 'Review dose for Melatonin scheduled at 22:30 on Thu 5 Nov',
    }),
  ).toBeVisible()
  // Cross-midnight intake shows its actual day and the amount that differs.
  expect(taken).toHaveTextContent('Taken 00:10')
  expect(taken).toHaveTextContent('took 2 tablets')
  expect(taken).toHaveTextContent('Taken on Fri 6 Nov')
})

test('a past Not logged row opens the record drawer on its own day and returns focus (#278)', async () => {
  renderDay({ result: { status: 'loaded', doses: [occurrence('08:00')], medicines: [medicine] } })
  const row = screen.getByRole('button', {
    name: 'Record dose for Melatonin scheduled at 08:00 on Thu 5 Nov',
  })
  await userEvent.click(row)
  const drawer = await screen.findByRole('dialog', { name: 'Melatonin' })
  expect(drawer).toHaveTextContent('Scheduled 08:00 on Thu 5 Nov')
  expect(within(drawer).getByRole('button', { name: 'I took it' })).toBeVisible()
  expect(within(drawer).getByRole('button', { name: 'I skipped it' })).toBeVisible()
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(row).toHaveFocus())
})

test('today so far opens the record drawer from a Not logged row', () => {
  renderDay({
    date: '2026-11-06',
    result: {
      status: 'loaded',
      doses: [
        { ...occurrence('08:00'), dueAt: new Date('2026-11-06T08:00:00+03:00').toISOString() },
      ],
      medicines: [medicine],
    },
  })
  expect(screen.getByText('0 of 1 so far')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Record dose for Melatonin scheduled at 08:00' }),
  ).toBeVisible()
  expect(screen.queryByText('Record it on Today')).toBeNull()
})

const emptyStateIcon = (name: string) => document.querySelector(`.lucide-${name}`)

test('a past day with no doses points to another day, with no action', () => {
  renderDay({ date: '2026-11-01' })
  expect(
    screen.getByRole('heading', { level: 2, name: 'Nothing was scheduled on Sunday, 1 November' }),
  ).toBeVisible()
  expect(screen.getByText('Use the arrows to see another day.')).toBeVisible()
  expect(emptyStateIcon('calendar')).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

test('stepping to another day focuses its heading', async () => {
  search = new URLSearchParams('date=2026-11-06')
  render(<HistoryDateNav today="2026-11-06" />)
  await userEvent.click(screen.getByRole('button', { name: 'Previous day' }))
  renderDay({ result: { status: 'loaded', doses: [occurrence('08:00')], medicines: [medicine] } })
  expect(screen.getByRole('heading', { name: 'Thursday, 5 November, 1 dose' })).toHaveFocus()
})

test('a late entry day cannot consume focus requested for the failed selected day', async () => {
  render(<HistoryDateNav today="2026-11-06" />)
  const previous = screen.getByRole('button', { name: 'Previous day' })
  await userEvent.click(previous)
  // The entry day can finish hydrating after the date bar has already changed the URL.
  const entry = renderDay({ date: '2026-11-06' })
  expect(previous).toHaveFocus()
  entry.unmount()
  renderDay({ date: '2026-11-05', result: { status: 'unavailable', retry: vi.fn() } })
  expect(screen.getByText(/^History for .* didn't load just now\.$/)).toHaveFocus()
})

test('picking an empty day focuses its title, which names the day', async () => {
  render(<HistoryDateNav today="2026-11-06" />)
  await userEvent.click(screen.getByRole('button', { name: /Choose a date/ }))
  await userEvent.click(document.querySelector<HTMLElement>('button[data-day="2026-11-01"]')!)
  renderDay({ date: '2026-11-01' })
  const title = screen.getByRole('heading', { name: 'Nothing was scheduled on Sunday, 1 November' })
  expect(title).toHaveFocus()
  expect(title).toHaveAttribute('id', dayHeadingId)
  expect(
    screen.getByRole('region', { name: 'Nothing was scheduled on Sunday, 1 November' }),
  ).toBeVisible()
})

test('today with nothing due yet says doses will show, with no action', () => {
  renderDay({ date: '2026-11-06' })
  expect(screen.getByRole('heading', { level: 2, name: 'Nothing due yet today' })).toBeVisible()
  expect(screen.getByText("Doses will show here once they're due.")).toBeVisible()
  expect(emptyStateIcon('calendar')).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

test.each(['2026-11-01', '2026-11-06'])(
  'no medicines and no doses on %s offers Add medication',
  (date) => {
    renderDay({ date, result: { status: 'loaded', doses: [], medicines: [] } })
    expect(screen.getByRole('heading', { level: 2, name: 'No doses here yet' })).toBeVisible()
    expect(screen.getByText('Doses you log will show here day by day.')).toBeVisible()
    expect(emptyStateIcon('pill')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add medication' })).toHaveAttribute(
      'href',
      '/medications?add',
    )
  },
)

test('an unavailable day offers one retry for that date', async () => {
  const retry = vi.fn()
  renderDay({ date: '2026-11-04', result: { status: 'unavailable', retry } })
  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent("History for Wed 4 Nov didn't load just now.")
  expect(alert).toHaveTextContent(
    "Check your connection and try again. Your records haven't changed.",
  )
  await userEvent.click(within(alert).getByRole('button', { name: 'Try this date again' }))
  expect(retry).toHaveBeenCalledOnce()
})

test('an invalid date shows today instead and replaces the URL', () => {
  const replaceState = vi.spyOn(window.history, 'replaceState')
  renderDay({ date: '2026-11-06', notice: 'invalid' })
  expect(screen.getByText('Nothing to show for that day.')).toBeVisible()
  expect(screen.getByText('History shows dates up to today. Showing today instead.')).toBeVisible()
  expect(replaceState).toHaveBeenCalledWith(null, '', '/history?date=2026-11-06')
})
