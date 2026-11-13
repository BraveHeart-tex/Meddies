import {
  QueryClientProvider,
  dehydrate,
  onlineManager,
  type QueryClient,
} from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import type { NextRouter } from 'next/router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import { MedicinePanel } from '../src/features/medicines/medicine-panel'
import { MedicationsHeader } from '../src/features/medicines/medications-header'
import { MedicationsScreen } from '../src/features/medicines/medications-screen'
import { medicineKeys } from '../src/features/medicines/queries'
import { scheduleKeys } from '../src/features/schedules/queries'
import { PrivateQueryHandoff } from '@/lib/private-query-handoff'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/medications',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

const medicine = (n: number): Medicine => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  label: `Medicine ${n}`,
  strength: null,
  unit: 'tablet',
})
const listOf = (length: number) => Array.from({ length }, (_, i) => medicine(i + 1))
const count = (n: number) => `${n} ${n === 1 ? 'medication' : 'medications'}`
// Just past `createQueryClient`'s 30s stale time.
const stale = 31_000
const refreshFailed = /Your medications didn't update just now\. Showing what loaded at \d\d:\d\d\./
const unavailable = "Your medications didn't load just now. Check your connection and try again."

/** Serves the medicine list and schedules snapshot, counting medicine reads. */
function medicinesApi(initial: Medicine[]) {
  let list = initial
  let reads = 0
  let failures = 0
  let gate: Promise<void> | null = null
  server.use(
    http.get('/api/medicines', async () => {
      reads++
      if (gate) await gate
      if (failures > 0) {
        failures--
        return HttpResponse.json({ error: 'unavailable' }, { status: 503 })
      }
      return HttpResponse.json({ medicines: list })
    }),
    http.get('/api/schedules', () =>
      HttpResponse.json({
        schedules: [],
        records: [],
        today: { date: '2026-11-14', now: '2026-11-14T08:00:00.000Z', doses: [], next: null },
      }),
    ),
  )
  return {
    reads: () => reads,
    serve: (next: Medicine[]) => (list = next),
    failNext: () => failures++,
    /** Holds reads until the returned release runs. */
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

const snapshot = {
  schedules: [],
  records: [],
  date: '2026-11-14',
  now: '2026-11-14T08:00:00.000Z',
}

let client: QueryClient

beforeEach(() => {
  // Query's stale time follows the faked clock; timers still run so React and MSW settle.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  client = createQueryClient()
})

afterEach(() => {
  client.clear()
  // Query's online state is global; a failed reconnect test must not pause later reads.
  onlineManager.setOnline(true)
})

/** Seeds the session cache with a list confirmed `age` ms ago. */
function cache(list: Medicine[], age = 0) {
  client.setQueryData(medicineKeys.list(), list, { updatedAt: Date.now() - age })
}

function renderList() {
  render(
    <QueryClientProvider client={client}>
      <MedicationsHeader />
      <MedicinePanel scheduleMode="list" initialNow="2026-11-14T08:00:00.000Z" />
    </QueryClientProvider>,
  )
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('with a cached list', () => {
  test('names the list and its add link with medication', async () => {
    medicinesApi(listOf(1))
    cache(listOf(1))
    renderList()
    expect(await screen.findByRole('region', { name: 'Your medications' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Add a medication' })).toBeVisible()
  })

  test('a fresh cache shows at once with no read', async () => {
    const api = medicinesApi(listOf(2))
    cache(listOf(1))
    renderList()
    expect(screen.getByText(count(1))).toBeVisible()
    expect(await screen.findByText('Medicine 1')).toBeVisible()
    await advance(1_000)
    expect(api.reads()).toBe(0)
  })

  test('a stale cache refreshes once on entry while the cached list stays', async () => {
    const api = medicinesApi(listOf(2))
    cache(listOf(1), stale)
    const release = api.hold()
    renderList()
    await waitFor(() => expect(api.reads()).toBe(1))
    expect(screen.getByText(count(1))).toBeVisible()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    release()
    expect(await screen.findByText(count(2))).toBeVisible()
    expect(api.reads()).toBe(1)
  })

  test('window focus refreshes a stale list exactly once', async () => {
    const api = medicinesApi(listOf(1))
    cache(listOf(1))
    renderList()
    api.serve(listOf(2))
    await advance(stale)
    expect(api.reads()).toBe(0)
    fireEvent(window, new Event('focus'))
    expect(await screen.findByText(count(2))).toBeVisible()
    await advance(1_000)
    expect(api.reads()).toBe(1)
  })

  test('reconnect refreshes a stale list exactly once', async () => {
    const api = medicinesApi(listOf(1))
    cache(listOf(1))
    renderList()
    api.serve(listOf(2))
    fireEvent(window, new Event('offline'))
    await advance(stale)
    expect(api.reads()).toBe(0)
    fireEvent(window, new Event('online'))
    expect(await screen.findByText(count(2))).toBeVisible()
    await advance(1_000)
    expect(api.reads()).toBe(1)
  })

  test('five minutes open makes no read', async () => {
    const api = medicinesApi(listOf(2))
    cache(listOf(1))
    renderList()
    await advance(5 * 60_000)
    expect(screen.getByText(count(1))).toBeVisible()
    expect(api.reads()).toBe(0)
  })

  test('a failed refresh keeps the list, and retry recovers and clears the alert', async () => {
    const api = medicinesApi(listOf(1))
    api.failNext()
    cache(listOf(1), stale)
    const user = renderList()
    expect(await screen.findByText(refreshFailed)).toBeVisible()
    expect(screen.getByText(count(1))).toBeVisible()
    expect(screen.getByText('Medicine 1')).toBeVisible()
    api.serve(listOf(2))
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(count(2))).toBeVisible()
    expect(screen.queryByText(refreshFailed)).not.toBeInTheDocument()
    expect(api.reads()).toBe(2)
  })

  test('the alert times the older read, in Istanbul', async () => {
    vi.setSystemTime(new Date('2026-11-14T10:40:00.000Z'))
    const api = medicinesApi(listOf(1))
    api.failNext()
    cache(listOf(1), stale)
    renderList()
    // 10:39:29 UTC is 13:39 in Istanbul, however the machine's zone is set.
    expect(await screen.findByText(/Showing what loaded at 13:39\./)).toBeVisible()
  })

  test('a failed schedules refresh is the same single alert, and keeps rows and Add', async () => {
    medicinesApi(listOf(1))
    client.setQueryData(scheduleKeys.snapshot(), snapshot, { updatedAt: Date.now() - stale })
    server.use(
      http.get('/api/schedules', () =>
        HttpResponse.json({ error: 'unavailable' }, { status: 503 }),
      ),
    )
    cache(listOf(1))
    renderList()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(refreshFailed)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1)
    expect(screen.getByText('Medicine 1')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Add a medication' })).toBeVisible()
  })

  test('a newer confirmed medicine survives a late hydration of an older list', async () => {
    medicinesApi(listOf(2))
    cache(listOf(2))
    // The server read finished after the save but saw the list from before it.
    const request = createQueryClient()
    request.setQueryData(medicineKeys.list(), listOf(1), { updatedAt: Date.now() + 1_000 })
    const late = dehydrate(request)
    render(
      <QueryClientProvider client={client}>
        <PrivateQueryHandoff state={late}>
          <MedicinePanel scheduleMode="list" initialNow="2026-11-14T08:00:00.000Z" serverEntry />
        </PrivateQueryHandoff>
      </QueryClientProvider>,
    )
    await advance(1_000)
    expect(client.getQueryState(medicineKeys.list())?.dataUpdatedAt).toBeGreaterThan(
      Date.now() - 500,
    )
    expect(await screen.findByText('Medicine 2')).toBeVisible()
  })

  test('a server-read entry starts no browser read of stale data', async () => {
    const api = medicinesApi(listOf(1))
    cache(listOf(1), stale)
    client.setQueryData(scheduleKeys.snapshot(), snapshot, { updatedAt: Date.now() - stale })
    render(
      <QueryClientProvider client={client}>
        <MedicinePanel scheduleMode="list" initialNow="2026-11-14T08:00:00.000Z" serverEntry />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Medicine 1')).toBeVisible()
    await advance(1_000)
    expect(api.reads()).toBe(0)
  })
})

describe('with no cache', () => {
  test('a loading state shows while the first read is pending', async () => {
    const api = medicinesApi(listOf(1))
    const release = api.hold()
    renderList()
    expect(await screen.findByRole('status')).toHaveTextContent('Loading medications')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Add a medication' })).toBeVisible()
    expect(screen.queryByText(count(0))).not.toBeInTheDocument()
    release()
    expect(await screen.findByText(count(1))).toBeVisible()
    expect(screen.queryByText('Loading medications')).not.toBeInTheDocument()
    expect(api.reads()).toBe(1)
  })

  test('a failed first read shows the load error, and retry recovers', async () => {
    const api = medicinesApi(listOf(1))
    api.failNext()
    const user = renderList()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(unavailable)
    expect(screen.queryByText(count(0))).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a medication' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(count(1))).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(api.reads()).toBe(2)
  })

  test('an empty list invites the first medication', async () => {
    medicinesApi([])
    renderList()
    const heading = await screen.findByRole('heading', { name: 'No medications here yet' })
    expect(heading).toBeVisible()
    const emptyState = heading.closest('[data-slot="empty-state"]')
    expect(emptyState?.querySelector('svg.lucide-pill')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText("Add your first one whenever you're ready.")).toBeVisible()
    expect(screen.getByRole('link', { name: 'Add medication' })).toHaveAttribute(
      'href',
      '/medications?add',
    )
    expect(screen.getByRole('link', { name: 'Add a medication' })).toBeVisible()
    expect(screen.queryByText(count(0))).not.toBeInTheDocument()
  })

  /* eslint-disable meddies/no-cosmetic-class-assertions -- the header Add's emphasis follows
     whether the list is known to be empty; its variant class is the only observable signal. */
  test('the header Add is soft only while the list is known to be empty', async () => {
    medicinesApi([])
    renderList()
    await screen.findByRole('heading', { name: 'No medications here yet' })
    const add = screen.getByRole('link', { name: 'Add a medication' })
    expect(add).toHaveClass('bg-accent')
    expect(add).not.toHaveClass('bg-primary')
    expect(screen.getByRole('link', { name: 'Add medication' })).toHaveClass('bg-primary')
  })

  test('the header Add stays primary with medications, and before the list is known', async () => {
    medicinesApi(listOf(1))
    renderList()
    expect(screen.getByRole('link', { name: 'Add a medication' })).toHaveClass('bg-primary')
    expect(await screen.findByText(count(1))).toBeVisible()
    expect(screen.getByRole('link', { name: 'Add a medication' })).toHaveClass('bg-primary')
  })
  /* eslint-enable meddies/no-cosmetic-class-assertions */

  test('a medication with no schedule says so in its list row', async () => {
    medicinesApi(listOf(1))
    renderList()
    expect(await screen.findByText('No schedule yet.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'View details for Medicine 1' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Set schedule for Medicine 1' })).toHaveAttribute(
      'href',
      `/medications?schedule=${medicine(1).id}#schedule-heading`,
    )
  })

  test('a failed schedules read shows the load error with its retry', async () => {
    medicinesApi(listOf(1))
    server.use(
      http.get('/api/schedules', () =>
        HttpResponse.json({ error: 'unavailable' }, { status: 503 }),
      ),
    )
    renderList()
    expect(await screen.findByRole('alert')).toHaveTextContent(unavailable)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
    // Unknown schedules never read as no schedule, and no rows or groups are invented.
    expect(screen.queryByText('No schedule yet.')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'No schedule' })).not.toBeInTheDocument()
    expect(screen.queryByText('Medicine 1')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a medication' })).toBeVisible()
  })
})

describe('a medication detail', () => {
  function renderDetail(id: string) {
    render(
      <QueryClientProvider client={client}>
        <MedicinePanel
          scheduleMode="detail"
          detailMedicineId={id}
          initialNow="2026-11-14T08:00:00.000Z"
        />
      </QueryClientProvider>,
    )
  }

  test('shows its details and that no schedule is set', async () => {
    medicinesApi(listOf(1))
    cache(listOf(1))
    renderDetail(medicine(1).id)
    expect(await screen.findByText('No schedule yet')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Schedule', level: 2 })).toBeVisible()
    expect(screen.getByText('tablet')).toBeVisible()
    expect(screen.getByText("Details can't be changed here yet.")).toBeVisible()
  })

  test('says when the medication is not in the list', async () => {
    medicinesApi(listOf(1))
    cache(listOf(1))
    renderDetail('00000000-0000-4000-8000-000000000999')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      "This medication isn't in your list",
    )
  })

  test('a failed schedules read shows the detail error with its retry', async () => {
    medicinesApi(listOf(1))
    server.use(
      http.get('/api/schedules', () =>
        HttpResponse.json({ error: 'unavailable' }, { status: 503 }),
      ),
    )
    cache(listOf(1))
    renderDetail(medicine(1).id)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Medicine 1's schedule couldn't be checked.",
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })
})

describe('Done for now', () => {
  // Outside Next's bundler, next/link is the Pages version; it ignores clicks without a router.
  const router = { prefetch: async () => {} } as unknown as NextRouter
  afterEach(() => window.history.replaceState(null, '', '/'))

  test('the empty state Add medication opens the add Drawer', async () => {
    medicinesApi([])
    window.history.replaceState(null, '', '/medications')
    const medicationsScreen = () => (
      <RouterContext.Provider value={router}>
        <QueryClientProvider client={client}>
          <MedicationsScreen initialNow="2026-11-14T08:00:00.000Z" />
        </QueryClientProvider>
      </RouterContext.Provider>
    )
    const { rerender } = render(medicationsScreen())
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })
    await user.click(await screen.findByRole('link', { name: 'Add medication' }))
    expect(window.location.search).toBe('?add')
    rerender(medicationsScreen())
    expect(await screen.findByRole('dialog', { name: 'Add medication' })).toBeVisible()
  })

  test('returns to the list and focuses the saved medicine', async () => {
    let saved = { ...medicine(1), label: 'Handoff Medicine' }
    const api = medicinesApi([])
    server.use(
      http.post('/api/medicines', async ({ request }) => {
        saved = (await request.json()) as Medicine
        api.serve([saved])
        return HttpResponse.json({ medicines: [saved] })
      }),
    )
    window.history.replaceState(null, '', '/medications?add')
    // A new element each time: the mocked search params only update when the screen re-renders.
    const medicationsScreen = () => (
      <RouterContext.Provider value={router}>
        <QueryClientProvider client={client}>
          <MedicationsScreen initialNow="2026-11-14T08:00:00.000Z" />
        </QueryClientProvider>
      </RouterContext.Provider>
    )
    const { rerender } = render(medicationsScreen())
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })
    await user.type(screen.getByRole('textbox', { name: 'Name' }), saved.label)
    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: 'Tablet' }))
    await user.click(screen.getByRole('button', { name: 'Save medication' }))
    await waitFor(() => expect(window.location.search).toBe(`?medicine=${saved.id}`))
    rerender(medicationsScreen())
    expect(await screen.findByRole('heading', { name: saved.label })).toHaveFocus()
    expect(await screen.findByRole('heading', { name: 'No schedule yet' })).toBeVisible()
    expect(
      screen.getByText(
        `Set the days and times you take it, or do it later from this page. Today won't list ${saved.label} until it has a schedule.`,
      ),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Set schedule' })).toBeVisible()
    await user.click(screen.getByRole('link', { name: 'Done for now' }))
    expect(window.location.pathname + window.location.search).toBe('/medications')
    rerender(medicationsScreen())
    expect(
      await screen.findByRole('link', { name: `View details for ${saved.label}` }),
    ).toHaveFocus()
    expect(screen.queryByText(`${saved.label} saved.`)).not.toBeInTheDocument()
  })
})
