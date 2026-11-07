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
const refreshFailed = /Your medicines could not be refreshed\. Showing the last successful list\./

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
      HttpResponse.json({ schedules: [], records: [], today: null }),
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
    await user.click(screen.getByRole('button', { name: 'Retry loading medicines' }))
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
    expect(await screen.findByRole('status')).toHaveTextContent('Loading saved routines...')
    expect(screen.queryByText(count(0))).not.toBeInTheDocument()
    release()
    expect(await screen.findByText(count(1))).toBeVisible()
    expect(screen.queryByText('Loading saved routines...')).not.toBeInTheDocument()
    expect(api.reads()).toBe(1)
  })

  test('a failed first read shows the load error, and retry recovers', async () => {
    const api = medicinesApi(listOf(1))
    api.failNext()
    const user = renderList()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your medicines could not be refreshed.')
    expect(screen.queryByText(count(0))).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry loading medicines' }))
    expect(await screen.findByText(count(1))).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(api.reads()).toBe(2)
  })
})
