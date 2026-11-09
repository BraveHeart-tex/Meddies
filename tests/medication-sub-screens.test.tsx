import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import type { NextRouter } from 'next/router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import { MedicationsFallback } from '../src/features/medicines/medications-fallback'
import { MedicationsHeader } from '../src/features/medicines/medications-header'
import { MedicationsScreen } from '../src/features/medicines/medications-screen'
import { MedicinePanel } from '../src/features/medicines/medicine-panel'
import { medicineKeys } from '../src/features/medicines/queries'
import type { DailySchedule } from '../src/features/schedules/contract'
import { SchedulePanel } from '../src/features/schedules/schedule-panel'
import { scheduleToday } from '../src/features/schedules/occurrences'
import { scheduleKeys } from '../src/features/schedules/queries'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/medications',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

// 09:00 on Friday 15 June in Istanbul.
const initialNow = '2035-06-15T06:00:00.000Z'
const magnesium: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Magnesium',
  strength: '200 mg',
  unit: 'tablet',
}
const unknownId = '00000000-0000-4000-8000-00000000ffff'
const schedule: DailySchedule = {
  id: '00000000-0000-4000-8000-0000000000a1',
  medicineId: magnesium.id,
  startDate: '2035-06-15',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  times: [{ time: '08:00', quantity: 1 }],
  confirmedAt: initialNow,
}
const unchecked = "Magnesium's schedule couldn't be checked."
const noSchedule: DailySchedule[] = []
const draftRestored = 'Pick up where you left off. Your details are still here.'
// Just past `createQueryClient`'s 30s stale time.
const stale = 31_000

type Read = () => Promise<void> | void

/** Serves both reads. A `before` hook can hold a read; `fail` answers 503 until cleared. */
function api({
  medicines = [magnesium],
  schedules = noSchedule,
}: { medicines?: Medicine[]; schedules?: DailySchedule[] } = {}) {
  const state = {
    medicines,
    schedules,
    failMedicines: false,
    failSchedules: false,
    beforeMedicines: (() => {}) as Read,
    beforeSchedules: (() => {}) as Read,
    medicineReads: 0,
    scheduleReads: 0,
  }
  server.use(
    http.get('/api/medicines', async () => {
      state.medicineReads++
      await state.beforeMedicines()
      if (state.failMedicines) return HttpResponse.json({ error: 'x' }, { status: 503 })
      return HttpResponse.json({ medicines: state.medicines })
    }),
    http.get('/api/schedules', async () => {
      state.scheduleReads++
      await state.beforeSchedules()
      if (state.failSchedules) return HttpResponse.json({ error: 'x' }, { status: 503 })
      return HttpResponse.json({
        schedules: state.schedules,
        records: [],
        today: scheduleToday(state.schedules, new Date(initialNow), []),
      })
    }),
  )
  return state
}

/** A read that waits until `release` runs. */
function gate() {
  let release = () => {}
  const wait = new Promise<void>((resolve) => (release = resolve))
  return { wait: () => wait, release: () => release() }
}

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
})
afterEach(() => {
  client.clear()
})

function renderDetail(id = magnesium.id) {
  window.history.replaceState(null, '', `/medications?medicine=${id}`)
  render(
    <QueryClientProvider client={client}>
      <MedicationsHeader />
      <MedicinePanel scheduleMode="detail" detailMedicineId={id} initialNow={initialNow} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const backRow = (name: string) => screen.getByRole('link', { name })
const setSchedule = () => screen.queryByRole('link', { name: 'Set schedule' })
const identity = (name: string) => screen.findByRole('heading', { level: 1, name })
const placeholders = () => document.querySelectorAll('[data-slot="skeleton"]')
const hour = () => screen.getByRole('combobox', { name: 'Time 1 hour' })

async function pickHour(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.click(await screen.findByRole('combobox', { name: 'Time 1 hour' }))
  await user.click(await screen.findByRole('option', { name: value }))
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}

/** Seeds both session cache entries, last confirmed `age` ms ago. */
function seedCache(medicines: Medicine[], age = 0) {
  const updatedAt = Date.now() - age
  client.setQueryData(medicineKeys.list(), medicines, { updatedAt })
  client.setQueryData(
    scheduleKeys.snapshot(),
    { schedules: [], records: [], date: '2035-06-15', now: initialNow },
    { updatedAt },
  )
}

test.each([
  { startDate: '2035-06-15', weekdays: [5], expected: 'First dose: today at 20:00.' },
  { startDate: '2035-06-18', weekdays: [1], expected: 'First dose: Mon 18 Jun at 08:00.' },
])(
  'the saved confirmation uses the first eligible dose: $expected',
  async ({ startDate, weekdays, expected }) => {
    api({
      schedules: [
        {
          ...schedule,
          startDate,
          weekdays,
          times: [
            { time: '08:00', quantity: 1 },
            { time: '20:00', quantity: 0.5 },
          ],
        },
      ],
    })
    render(
      <QueryClientProvider client={client}>
        <SchedulePanel
          mode="detail"
          initialMedicineId={magnesium.id}
          initialNow={initialNow}
          justScheduled
        />
      </QueryClientProvider>,
    )
    expect(await screen.findByText(expected)).toBeVisible()
    expect(screen.getByRole('status', { name: 'Saved schedule' })).toHaveTextContent(
      'Schedule saved for Magnesium.',
    )
  },
)

test('the schedule card separates product strength from each time and dose quantity', async () => {
  api({
    schedules: [
      {
        ...schedule,
        times: [
          { time: '08:00', quantity: 1 },
          { time: '20:00', quantity: 0.5 },
        ],
      },
    ],
  })
  renderDetail()
  const card = await screen.findByRole('region', { name: 'Schedule' })
  expect(within(card).getByText('08:00').parentElement).toHaveTextContent('1 tablet')
  expect(within(card).getByText('20:00').parentElement).toHaveTextContent('½ tablet')
  expect(card).not.toHaveTextContent('200 mg')
  expect(card).toHaveTextContent('Started Fri 15 Jun')
})

describe('the medication page', () => {
  test('names the medication in its identity header below a Back row to Medications', async () => {
    api()
    renderDetail()
    await identity('Magnesium')
    expect(screen.getByText('200 mg · tablet')).toBeVisible()
    expect(backRow('Medications')).toHaveAttribute('href', '/medications')
    expect(screen.getByRole('link', { name: 'Settings' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Medications' })).not.toBeInTheDocument()
    expect(await screen.findByText('No schedule yet')).toBeVisible()
    expect(setSchedule()).toBeVisible()
  })

  test('shows only the unit when the medication has no strength', async () => {
    api({ medicines: [{ ...magnesium, strength: null }] })
    renderDetail()
    await identity('Magnesium')
    expect(screen.getByText('tablet')).toBeVisible()
  })

  test('647·D1 holds the Back row, header and schedule card with one status', async () => {
    const reads = api()
    const held = gate()
    reads.beforeMedicines = held.wait
    reads.beforeSchedules = held.wait
    renderDetail()
    expect(backRow('Medications')).toBeVisible()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Loading medication')
    expect(placeholders().length).toBeGreaterThan(0)
    for (const placeholder of placeholders())
      expect(placeholder).toHaveAttribute('aria-hidden', 'true')
    held.release()
    await identity('Magnesium')
    await waitFor(() => expect(placeholders()).toHaveLength(0))
  })

  test('a known medication keeps its identity while only the schedule loads', async () => {
    const reads = api()
    const held = gate()
    reads.beforeSchedules = held.wait
    client.setQueryData(medicineKeys.list(), [magnesium])
    renderDetail()
    await identity('Magnesium')
    expect(screen.getByRole('status')).toHaveTextContent('Loading schedule')
    expect(setSchedule()).not.toBeInTheDocument()
    held.release()
    expect(await screen.findByText('No schedule yet')).toBeVisible()
  })

  test('647·D2 not found offers Open Medications and no Set schedule', async () => {
    api()
    renderDetail(unknownId)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("This medication isn't in your list")
    expect(alert).toHaveTextContent('It may be a link from another account or an old link.')
    expect(alert.querySelector('svg.lucide-info')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      "This medication isn't in your list",
    )
    const open = screen.getByRole('link', { name: 'Open Medications' })
    expect(open).toHaveAttribute('href', '/medications')
    expect(alert).not.toContainElement(open)
    expect(backRow('Medications')).toBeVisible()
    expect(setSchedule()).not.toBeInTheDocument()
  })

  test('a medication with no schedule says what is missing and offers Set schedule', async () => {
    api()
    renderDetail()
    const heading = await screen.findByRole('heading', { name: 'No schedule yet' })
    const emptyState = heading.closest('[data-slot="empty-state"]')
    expect(emptyState?.querySelector('svg.lucide-clock')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText("Today won't list Magnesium until it has a schedule.")).toBeVisible()
    expect(setSchedule()).toBeVisible()
    expect(setSchedule()).toHaveClass('bg-primary')
  })

  test('647·D2 does not wait for the schedule read, or show its failure', async () => {
    const reads = api()
    reads.failSchedules = true
    renderDetail(unknownId)
    expect(await screen.findByText("This medication isn't in your list")).toBeVisible()
    expect(screen.queryByText(/couldn't be checked/)).not.toBeInTheDocument()
  })

  test('647·D3 keeps the identity and hides Set schedule until Retry succeeds', async () => {
    const reads = api()
    reads.failSchedules = true
    const user = renderDetail()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(unchecked)
    await identity('Magnesium')
    expect(setSchedule()).not.toBeInTheDocument()
    expect(screen.queryByText('No schedule yet')).not.toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(unchecked)
    expect(setSchedule()).not.toBeInTheDocument()

    reads.failSchedules = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No schedule yet')).toBeVisible()
    expect(setSchedule()).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('Retry showing a saved schedule never offers Set schedule', async () => {
    const reads = api({ schedules: [schedule] })
    reads.failSchedules = true
    const user = renderDetail()
    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    reads.failSchedules = false
    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/Started /)).toBeVisible()
    expect(setSchedule()).not.toBeInTheDocument()
  })

  test('a failed medication read keeps the Back row and retries', async () => {
    const reads = api()
    reads.failMedicines = true
    const user = renderDetail()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This medication didn't load just now.",
    )
    expect(backRow('Medications')).toBeVisible()
    expect(setSchedule()).not.toBeInTheDocument()
    reads.failMedicines = false
    await user.click(screen.getByRole('button', { name: 'Try loading medication again' }))
    await identity('Magnesium')
  })
})

describe('schedule setup', () => {
  function renderSetup(id = magnesium.id) {
    window.history.replaceState(null, '', `/medications?schedule=${id}`)
    render(
      <QueryClientProvider client={client}>
        <MedicationsHeader />
        <MedicinePanel scheduleMode="setup" scheduleMedicineId={id} initialNow={initialNow} />
      </QueryClientProvider>,
    )
    return userEvent.setup()
  }

  test('Back names the medication and returns to its page', async () => {
    api()
    renderSetup()
    await identity('Magnesium')
    expect(screen.getByText('Set schedule', { selector: 'p' })).toBeVisible()
    expect(backRow('Magnesium')).toHaveAttribute('href', `/medications?medicine=${magnesium.id}`)
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Medications' })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Save schedule' })).toBeVisible()
  })

  test('a long name stays whole in Back and the heading', async () => {
    const label = 'Levothyroxine sodium extended release 75 micrograms'
    api({ medicines: [{ ...magnesium, label }] })
    renderSetup()
    await identity(label)
    expect(backRow(label)).toBeVisible()
  })

  test('loading reuses the header above a form block, with no generic Back', async () => {
    const reads = api()
    const held = gate()
    reads.beforeMedicines = held.wait
    reads.beforeSchedules = held.wait
    renderSetup()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Loading schedule setup')
    expect(placeholders().length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /back/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save schedule' })).not.toBeInTheDocument()
    held.release()
    expect(await screen.findByRole('button', { name: 'Save schedule' })).toBeVisible()
    expect(placeholders()).toHaveLength(0)
  })

  test('647·D2 not found has the same card and way out', async () => {
    api()
    renderSetup(unknownId)
    expect(await screen.findByText("This medication isn't in your list")).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open Medications' })).toBeVisible()
    expect(backRow('Medications')).toHaveAttribute('href', '/medications')
    expect(screen.queryByRole('button', { name: 'Save schedule' })).not.toBeInTheDocument()
  })

  test('647·D3 keeps the identity and shows no form until Retry succeeds', async () => {
    const reads = api()
    reads.failSchedules = true
    const user = renderSetup()
    expect(await screen.findByRole('alert')).toHaveTextContent(unchecked)
    await identity('Magnesium')
    expect(screen.queryByRole('button', { name: 'Save schedule' })).not.toBeInTheDocument()
    reads.failSchedules = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Save schedule' })).toBeVisible()
  })

  test('a late refresh leaves a draft being typed alone', async () => {
    const reads = api()
    const held = gate()
    reads.beforeMedicines = held.wait
    reads.beforeSchedules = held.wait
    seedCache([magnesium], stale)
    const user = renderSetup()
    await identity('Magnesium')
    await pickHour(user, '08')
    held.release()
    await waitFor(() => expect(reads.scheduleReads).toBe(1))
    await waitFor(() => expect(client.isFetching()).toBe(0))
    expect(hour()).toHaveTextContent('08')
    expect(screen.queryByText(draftRestored)).not.toBeInTheDocument()
  })
})

describe('refreshes', () => {
  test('a stale page keeps its content, with no skeleton, while it refreshes', async () => {
    const reads = api()
    const held = gate()
    reads.beforeMedicines = held.wait
    reads.beforeSchedules = held.wait
    seedCache([magnesium], stale)
    renderDetail()
    await identity('Magnesium')
    expect(screen.getByText('No schedule yet')).toBeVisible()
    await waitFor(() => expect(reads.medicineReads).toBe(1))
    expect(placeholders()).toHaveLength(0)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    held.release()
  })

  test('a failed refresh keeps the page and Set schedule, and adds a notice', async () => {
    const reads = api()
    reads.failMedicines = true
    seedCache([magnesium], stale)
    renderDetail()
    expect(await screen.findByText(/didn't update just now/)).toBeVisible()
    expect(screen.getByRole('heading', { level: 1, name: 'Magnesium' })).toBeVisible()
    expect(setSchedule()).toBeVisible()
  })
})

describe('the mounted screen', () => {
  // Outside Next's bundler, next/link is the Pages version; it ignores clicks without a router.
  const router = { prefetch: async () => {} } as unknown as NextRouter
  const iron: Medicine = { ...magnesium, id: unknownId, label: 'Iron' }
  beforeEach(() => {
    // jsdom has no layout; setup links scroll to their heading.
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => window.history.replaceState(null, '', '/'))

  // A new element each time: the mocked search params only update when the screen re-renders.
  const screenAt = () => (
    <RouterContext.Provider value={router}>
      <QueryClientProvider client={client}>
        <MedicationsScreen initialNow={initialNow} />
      </QueryClientProvider>
    </RouterContext.Provider>
  )

  test('a read that lands late cannot replace a newer selection', async () => {
    const reads = api({ medicines: [magnesium, iron] })
    const held = gate()
    reads.beforeMedicines = held.wait
    window.history.replaceState(null, '', `/medications?medicine=${magnesium.id}`)
    const { rerender } = render(screenAt())
    window.history.replaceState(null, '', `/medications?medicine=${iron.id}`)
    rerender(screenAt())
    held.release()
    await identity('Iron')
    expect(screen.queryByRole('heading', { name: 'Magnesium' })).not.toBeInTheDocument()
  })

  test('Back from setup and returning restores the session draft', async () => {
    api()
    seedCache([magnesium])
    window.history.replaceState(null, '', `/medications?schedule=${magnesium.id}`)
    const { rerender } = render(screenAt())
    const user = userEvent.setup()
    await identity('Magnesium')
    await pickHour(user, '08')

    await user.click(backRow('Magnesium'))
    expect(window.location.search).toBe(`?medicine=${magnesium.id}`)
    rerender(screenAt())
    expect(await screen.findByText('No schedule yet')).toBeVisible()

    await user.click(screen.getByRole('link', { name: 'Set schedule' }))
    expect(window.location.search).toBe(`?schedule=${magnesium.id}`)
    rerender(screenAt())
    await identity('Magnesium')
    expect(hour()).toHaveTextContent('08')
    expect(screen.getByText(draftRestored)).toBeVisible()
  })
})

describe('the Suspense fallback', () => {
  function renderFallback(search: string) {
    window.history.replaceState(null, '', `/medications?${search}`)
    render(
      <QueryClientProvider client={client}>
        <MedicationsFallback />
      </QueryClientProvider>,
    )
  }

  test.each([
    [`medicine=${magnesium.id}`, 'Loading medication'],
    [`schedule=${magnesium.id}`, 'Loading schedule setup'],
  ])('%s without a cache shows its own skeleton and starts no read', async (search, label) => {
    const reads = api()
    renderFallback(search)
    expect(await screen.findByRole('status')).toHaveTextContent(label)
    expect(screen.queryByText('Loading medications')).not.toBeInTheDocument()
    expect(reads.medicineReads + reads.scheduleReads).toBe(0)
  })

  test('with cached data shows the page, not a skeleton, and starts no read', async () => {
    const reads = api()
    seedCache([magnesium], stale)
    renderFallback(`medicine=${magnesium.id}`)
    await identity('Magnesium')
    expect(placeholders()).toHaveLength(0)
    expect(reads.medicineReads + reads.scheduleReads).toBe(0)
  })

  test('a cached list without this medication waits for the server, never a false not-found', async () => {
    api()
    seedCache([magnesium])
    renderFallback(`medicine=${unknownId}`)
    expect(await screen.findByRole('status')).toHaveTextContent('Loading medication')
    expect(screen.queryByText("This medication isn't in your list")).not.toBeInTheDocument()
  })
})
