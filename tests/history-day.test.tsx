import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import type { DoseOccurrence } from '../src/features/schedules/contract'
import { HistoryDateNav } from '../src/features/schedules/history-date-nav'
import { HistoryDay } from '../src/features/schedules/history-day'
import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import { createQueryClient } from '../src/lib/session-query-client'

let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
  usePathname: () => '/history',
}))

// Date changes use the native History API, so the results read the dated query (FE-679).
const push = vi.spyOn(window.history, 'pushState')
const pushed = () => push.mock.lastCall?.[2]
beforeEach(() => {
  push.mockReset()
  search = new URLSearchParams()
})

test('Previous day and Next day push the neighbouring dates (D11)', async () => {
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

test('a populated day lists doses in time order; Not logged rows are not buttons (648·H1)', () => {
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
  expect(screen.getByRole('heading', { name: 'Thursday 5 November, 2 doses' })).toBeVisible()
  expect(screen.getByText('1 of 2 logged')).toBeVisible()
  const [unlogged, taken] = within(
    screen.getByRole('list', { name: 'Doses for 2026-11-05' }),
  ).getAllByRole('listitem')
  expect(within(unlogged).queryByRole('button')).toBeNull()
  expect(unlogged).toHaveTextContent('Not logged')
  expect(within(taken).getByRole('button', { name: /^Review dose for Melatonin/ })).toBeVisible()
  // Cross-midnight intake shows its actual day and the amount that differs.
  expect(taken).toHaveTextContent('Taken 00:10')
  expect(taken).toHaveTextContent('took 2 tablets')
  expect(taken).toHaveTextContent('Taken on Fri 6 Nov')
})

test('today so far points Not logged rows to Today (648·H2)', () => {
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
  expect(screen.getByText('Record it on Today')).toBeVisible()
})

test('an empty day says nothing was scheduled (648·H3)', () => {
  renderDay({ date: '2026-11-01' })
  expect(screen.getByText('Nothing was scheduled on Sunday 1 November.')).toBeVisible()
})

test('an empty today says nothing was due yet (648·H3)', () => {
  renderDay({ date: '2026-11-06' })
  expect(screen.getByText('Nothing was due before now today.')).toBeVisible()
})

test('an unavailable day offers one retry for that date (648·H5)', async () => {
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

test('an invalid date shows today instead and replaces the URL (648·H6)', () => {
  const replaceState = vi.spyOn(window.history, 'replaceState')
  renderDay({ date: '2026-11-06', notice: 'invalid' })
  expect(screen.getByText('Nothing to show for that day.')).toBeVisible()
  expect(screen.getByText('History shows dates up to today. Showing today instead.')).toBeVisible()
  expect(replaceState).toHaveBeenCalledWith(null, '', '/history?date=2026-11-06')
})
