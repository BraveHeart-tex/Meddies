import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import { MedicinePanel } from '../src/features/medicines/medicine-panel'
import { medicineKeys } from '../src/features/medicines/queries'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/medications',
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
const refreshFailed =
  /Your medications didn't update just now\. Showing the last list that loaded\./

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
    await user.click(screen.getByRole('button', { name: 'Try loading medications again' }))
    expect(await screen.findByText(count(2))).toBeVisible()
    expect(screen.queryByText(refreshFailed)).not.toBeInTheDocument()
    expect(api.reads()).toBe(2)
  })
})

describe('with no cache', () => {
  test('a loading state shows while the first read is pending', async () => {
    const api = medicinesApi(listOf(1))
    const release = api.hold()
    renderList()
    expect(await screen.findByRole('status')).toHaveTextContent('Loading your medications…')
    expect(screen.queryByText(count(0))).not.toBeInTheDocument()
    release()
    expect(await screen.findByText(count(1))).toBeVisible()
    expect(screen.queryByText('Loading your medications…')).not.toBeInTheDocument()
    expect(api.reads()).toBe(1)
  })

  test('a failed first read shows the load error, and retry recovers', async () => {
    const api = medicinesApi(listOf(1))
    api.failNext()
    const user = renderList()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      "Your medications didn't load just now. Check your connection and try again.",
    )
    expect(screen.queryByText(count(0))).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try loading medications again' }))
    expect(await screen.findByText(count(1))).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(api.reads()).toBe(2)
  })

  test('an empty list invites the first medication', async () => {
    medicinesApi([])
    renderList()
    expect(
      await screen.findByText("No medications here yet. Add your first one whenever you're ready."),
    ).toBeVisible()
  })

  test('a medication with no schedule says so in its list row', async () => {
    medicinesApi(listOf(1))
    renderList()
    expect(await screen.findByText('No schedule yet.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'View details for Medicine 1' })).toBeVisible()
  })

  test('a failed schedules read shows the load error with its retry', async () => {
    medicinesApi(listOf(1))
    server.use(
      http.get('/api/schedules', () =>
        HttpResponse.json({ error: 'unavailable' }, { status: 503 }),
      ),
    )
    renderList()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Your schedules didn't load just now. Check your connection and try again.",
    )
    expect(screen.getByRole('button', { name: 'Try loading schedules again' })).toBeVisible()
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
    expect(await screen.findByText('No schedule yet.')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Schedule', level: 2 })).toBeVisible()
    expect(screen.getByText('Strength: Not added')).toBeVisible()
    expect(screen.getByText("Medication details can't be changed here.")).toBeVisible()
  })

  test('says when the medication is not in the list', async () => {
    medicinesApi(listOf(1))
    cache(listOf(1))
    renderDetail('00000000-0000-4000-8000-000000000999')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This medication isn't in your list.",
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
      "This schedule didn't load just now. Check your connection and try again.",
    )
    expect(screen.getByRole('button', { name: 'Try loading schedule again' })).toBeVisible()
  })
})
