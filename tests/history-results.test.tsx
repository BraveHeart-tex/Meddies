import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import { medicineKeys } from '../src/features/medicines/queries'
import type { DoseOccurrence } from '../src/features/schedules/contract'
import { HistoryResults } from '../src/features/schedules/history-results'
import { scheduleKeys } from '../src/features/schedules/queries'
import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/history',
}))

const today = '2026-11-06'
const medicine: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Melatonin',
  strength: '3 mg',
  unit: 'tablet',
}
const scheduleId = '00000000-0000-4000-8000-000000000002'
const dose = (date: string, status: 'Not logged' | 'Skipped' = 'Not logged') =>
  ({
    id: `${scheduleId}:${date}`,
    scheduleId,
    medicineId: medicine.id,
    dueAt: new Date(`${date}T08:00:00+03:00`).toISOString(),
    quantity: 1,
    status,
    ...(status === 'Skipped'
      ? {
          record: {
            scheduleId,
            dueAt: new Date(`${date}T08:00:00+03:00`).toISOString(),
            outcome: 'Skipped',
            revision: 1,
          },
        }
      : {}),
  }) as DoseOccurrence

/** Serves History reads per date, counting them; a read can be held until released. */
function serveHistory(respond: (date: string) => Response | Promise<Response>) {
  const reads: string[] = []
  server.use(
    http.get('/api/schedules/history', ({ request }) => {
      const date = new URL(request.url).searchParams.get('date')!
      reads.push(date)
      return respond(date)
    }),
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
  )
  return reads
}

function seeded(entries: Record<string, DoseOccurrence[]>) {
  const client = createQueryClient()
  client.setQueryData(medicineKeys.list(), [medicine])
  for (const [date, doses] of Object.entries(entries))
    client.setQueryData(scheduleKeys.history(date), doses)
  return client
}

function renderResults(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <SchedulingClockProvider serverNow={`${today}T09:00:00.000Z`}>
        <HistoryResults today={today} />
      </SchedulingClockProvider>
    </QueryClientProvider>,
  )
}

const doseList = (date: string) => screen.findByRole('list', { name: `Doses for ${date}` })

beforeEach(() => {
  search = new URLSearchParams()
})

test('the server-prefetched entry date renders without a browser read', async () => {
  search = new URLSearchParams('date=2026-11-05')
  const reads = serveHistory(() => HttpResponse.json({ doses: [] }))
  renderResults(seeded({ '2026-11-05': [dose('2026-11-05')] }))
  expect(await doseList('2026-11-05')).toHaveTextContent('Melatonin')
  expect(reads).toEqual([])
})

test('a cached date renders at once and refreshes quietly', async () => {
  search = new URLSearchParams('date=2026-11-05')
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  const reads = serveHistory(async (date) => {
    await held
    return HttpResponse.json({ doses: [dose(date, 'Skipped')] })
  })
  const client = seeded({ '2026-11-05': [dose('2026-11-05')], '2026-11-04': [dose('2026-11-04')] })
  const view = renderResults(client)
  await doseList('2026-11-05')

  search = new URLSearchParams('date=2026-11-04')
  view.rerender(
    <QueryClientProvider client={client}>
      <SchedulingClockProvider serverNow={`${today}T09:00:00.000Z`}>
        <HistoryResults today={today} />
      </SchedulingClockProvider>
    </QueryClientProvider>,
  )
  // Cached doses show at once while the stale date refreshes; no skeleton replaces them.
  expect(screen.getByRole('list', { name: 'Doses for 2026-11-04' })).toHaveTextContent('Not logged')
  expect(screen.queryByRole('status')).toBeNull()
  await waitFor(() => expect(reads).toEqual(['2026-11-04']))
  release()
  await waitFor(() =>
    expect(screen.getByRole('list', { name: 'Doses for 2026-11-04' })).toHaveTextContent('Skipped'),
  )
})

test('an uncached date shows the 648·H4 fallback, then its doses', async () => {
  search = new URLSearchParams('date=2026-11-03')
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  serveHistory(async (date) => {
    await held
    return HttpResponse.json({ doses: [dose(date)] })
  })
  renderResults(seeded({}))
  expect(await screen.findByRole('status')).toHaveTextContent('Loading history')
  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4)
  release()
  expect(await doseList('2026-11-03')).toHaveTextContent('Melatonin')
  expect(screen.queryByRole('status')).toBeNull()
})

test('bare /history and a future date read today', async () => {
  const reads = serveHistory((date) => HttpResponse.json({ doses: [dose(date)] }))
  renderResults(seeded({}))
  await doseList(today)
  expect(reads).toEqual([today])
})

test('Retry refetches a failed date without reloading', async () => {
  search = new URLSearchParams('date=2026-11-04')
  let fail = true
  const reads = serveHistory((date) =>
    fail ? HttpResponse.json({}, { status: 503 }) : HttpResponse.json({ doses: [dose(date)] }),
  )
  renderResults(seeded({}))
  const retry = await screen.findByRole('button', { name: 'Retry this date' })
  expect(screen.getByRole('alert')).toHaveTextContent('History for Wed 4 Nov could not be loaded.')
  fail = false
  retry.click()
  expect(await doseList('2026-11-04')).toHaveTextContent('Melatonin')
  expect(reads).toEqual(['2026-11-04', '2026-11-04'])
  expect(screen.getByRole('heading', { name: 'Wednesday 4 November, 1 dose' })).toHaveFocus()
})

test('a 401 from the browser read shows that the session ended', async () => {
  search = new URLSearchParams('date=2026-11-04')
  serveHistory(() => HttpResponse.json({ error: 'unauthorized' }, { status: 401 }))
  renderResults(seeded({}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Your session ended.')
})

test('a past-date History correction reconciles its own date, not Today or other dates', async () => {
  search = new URLSearchParams('date=2026-11-05')
  const dueAt = new Date('2026-11-05T08:00:00+03:00').toISOString()
  const taken = {
    ...dose('2026-11-05'),
    status: 'Taken',
    record: {
      scheduleId,
      dueAt,
      outcome: 'Taken',
      takenAt: dueAt,
      quantity: 1,
      revision: 1,
    },
  } as DoseOccurrence
  const reads = serveHistory((date) => HttpResponse.json({ doses: [dose(date, 'Skipped')] }))
  server.use(
    http.patch('/api/schedules', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({
        record: {
          scheduleId,
          dueAt,
          outcome: 'Skipped',
          recordedAt: `${today}T06:00:00.000Z`,
          revision: 2,
          actionId: body.actionId,
        },
      })
    }),
  )
  const client = seeded({ '2026-11-05': [taken], '2026-11-04': [dose('2026-11-04')] })
  client.setQueryData(scheduleKeys.snapshot(), {
    schedules: [],
    records: [],
    now: `${today}T06:00:00.000Z`,
    date: today,
  })
  renderResults(client)
  await doseList('2026-11-05')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /^Review dose for Melatonin/ }))
  await user.click(screen.getByRole('button', { name: /^Correct outcome/ }))
  await user.click(screen.getByRole('button', { name: 'I skipped it' }))
  await user.click(screen.getByRole('button', { name: 'Save as skipped' }))
  await waitFor(() => expect(reads).toEqual(['2026-11-05']))
  expect(client.getQueryState(scheduleKeys.history('2026-11-04'))?.isInvalidated).toBe(false)
  expect(client.getQueryState(scheduleKeys.snapshot())?.isInvalidated).toBe(false)
})
