import {
  QueryClientProvider,
  dehydrate,
  onlineManager,
  type QueryClient,
} from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import type { NextRouter } from 'next/router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import { MedicinePanel } from '../src/features/medicines/medicine-panel'
import { MedicationsHeader } from '../src/features/medicines/medications-header'
import { medicationRecordHref } from '../src/features/medicines/routes'
import { MedicationsScreen } from '../src/features/medicines/medications-screen'
import { medicineKeys } from '../src/features/medicines/queries'
import { scheduleKeys } from '../src/features/schedules/queries'
import { PrivateQueryHandoff } from '@/lib/private-query-handoff'
import { createQueryClient } from '../src/lib/session-query-client'
import { Toaster } from '../src/components/ui/toast'
import { findConfirmation } from './helpers/toasts'
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
const refreshFailed = /Couldn’t update medications\. Showing details loaded at \d\d:\d\d\./
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
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1 })
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
    await user.click(screen.getByRole('button', { name: 'Try again' }))
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
    expect(await screen.findByText(/Showing details loaded at 13:39\./)).toBeVisible()
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
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
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
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(count(1))).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(api.reads()).toBe(2)
  })

  test('an empty list invites the first medication', async () => {
    medicinesApi([])
    renderList()
    const heading = await screen.findByRole('heading', { name: 'No medications yet' })
    expect(heading).toBeVisible()
    const emptyState = heading.closest('[data-slot="empty-state"]')
    expect(emptyState?.querySelector('svg.lucide-pill')).toHaveAttribute('aria-hidden', 'true')
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
    await screen.findByRole('heading', { name: 'No medications yet' })
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

  test('a medication with no schedule uses the group heading without repeating it (#275)', async () => {
    medicinesApi(listOf(1))
    renderList()
    const group = await screen.findByRole('region', { name: 'No schedule' })
    expect(within(group).getByRole('heading', { name: 'No schedule' })).toBeVisible()
    expect(within(group).getByRole('listitem')).not.toHaveTextContent('No schedule')
    expect(screen.queryByText(/No schedule yet|As needed/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View details for Medicine 1' })).toBeVisible()
    expect(screen.queryByRole('link', { name: /Set schedule/ })).not.toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
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
    const period = '00000000-0000-4000-8000-0000000000c1'
    const list = [{ ...medicine(1), currentStrengthRevisionId: period }]
    medicinesApi(list)
    cache(list)
    renderDetail(medicine(1).id)
    expect(await screen.findByText('No schedule', { exact: true })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Schedule', level: 2 })).toBeVisible()
    expect(screen.getByText('tablet')).toBeVisible()
    // 346·C1: Edit details alone with its effect, then the two strength rows together.
    const details = screen.getByRole('region', { name: 'Medication details' })
    const edit = within(details).getByRole('link', { name: 'Edit details' })
    expect(edit).toHaveAttribute('href', medicationRecordHref(medicine(1).id, 'fix', period))
    expect(within(edit).getByText('Updates doses logged at the current strength.')).toBeVisible()
    const groups = details.querySelectorAll('[data-slot="item-group"]')
    expect(groups).toHaveLength(2)
    expect(within(groups[0] as HTMLElement).getAllByRole('link')).toEqual([edit])
    expect(
      within(groups[1] as HTMLElement)
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual(['Change strength', 'Strength history'])
    expect(screen.queryByRole('link', { name: /Fix a mistake/ })).not.toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
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
          <Toaster>
            <MedicationsScreen initialNow="2026-11-14T08:00:00.000Z" />
          </Toaster>
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
    // #377: the save confirmation is a Toast, not an inline Alert.
    await findConfirmation(`${saved.label} saved.`, 'check')
    expect(await screen.findByText('No schedule', { exact: true })).toBeVisible()
    expect(
      screen.queryByText('Today lists its doses once it has a schedule, or when you log one.'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set schedule' })).toBeVisible()
    await user.click(screen.getByRole('link', { name: 'Done for now' }))
    expect(window.location.pathname + window.location.search).toBe('/medications')
    rerender(medicationsScreen())
    expect(
      await screen.findByRole('link', { name: `View details for ${saved.label}` }),
    ).toHaveFocus()
  })
})

describe('Archived medications', () => {
  const router = { prefetch: async () => {} } as unknown as NextRouter
  afterEach(() => window.history.replaceState(null, '', '/'))
  // A full record, as the API returns: only a parsed record keeps its archivedAt.
  const archived = (n: number): Medicine => {
    const revisionId = `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
    const details = { label: `Archived ${n}`, strength: '400 mg', unit: 'tablet' } as const
    return {
      ...medicine(n),
      ...details,
      revision: 2,
      lastActionId: null,
      currentStrengthRevisionId: revisionId,
      strengthRevisions: [
        { id: revisionId, effectiveAt: '2026-11-01T00:00:00.000Z', previousValues: [], ...details },
      ],
      everHadSchedule: true,
      everHadDose: true,
      latestTakenAt: null,
      archivedAt: '2026-11-13T09:00:00.000Z',
    }
  }
  const mixed = [medicine(1), archived(2)]
  // A new element each time: the mocked search params only update when the screen re-renders.
  const medicationsScreen = () => (
    <RouterContext.Provider value={router}>
      <QueryClientProvider client={client}>
        <MedicationsHeader />
        <MedicationsScreen initialNow="2026-11-14T08:00:00.000Z" />
      </QueryClientProvider>
    </RouterContext.Provider>
  )
  function renderAt(search: string) {
    window.history.replaceState(null, '', `/medications${search}`)
    const view = render(medicationsScreen())
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })
    return { user, rerender: () => view.rerender(medicationsScreen()) }
  }

  test('Medications and its count leave out Archived medicines', async () => {
    medicinesApi(mixed)
    cache(mixed)
    renderAt('')
    expect(await screen.findByText('Medicine 1')).toBeVisible()
    expect(screen.getByText(count(1))).toBeVisible()
    expect(screen.queryByText('Archived 2')).not.toBeInTheDocument()
  })

  test('with only Archived medicines, Medications invites the first medication', async () => {
    medicinesApi([archived(2)])
    cache([archived(2)])
    renderAt('')
    expect(await screen.findByRole('heading', { name: 'No medications yet' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Archived medications' })).toBeVisible()
  })

  test('the entry opens the list of Archived medicines only', async () => {
    medicinesApi(mixed)
    cache(mixed)
    const { user, rerender } = renderAt('')
    await user.click(await screen.findByRole('link', { name: 'Archived medications' }))
    expect(window.location.search).toBe('?archived')
    rerender()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Archived medications' }),
    ).toBeVisible()
    expect(
      screen.queryByText('Kept out of your daily list. Their doses stay in History.'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Archived 2/ })).toHaveTextContent(
      '400 mg · tablet · Archived',
    )
    expect(screen.queryByText('Medicine 1')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add a medication' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Medications' })).toHaveAttribute(
      'href',
      '/medications',
    )
  })

  test('with no Archived medicines, shows the empty state', async () => {
    medicinesApi([medicine(1)])
    cache([medicine(1)])
    renderAt('?archived')
    expect(await screen.findByRole('heading', { name: 'No archived medications' })).toBeVisible()
    expect(
      screen.queryByText('Medications you archive will stay here. Their doses stay in History.'),
    ).not.toBeInTheDocument()
  })

  test('an Archived medicine opens read-only: Restore is its only action, with no edit, Archive or dose action', async () => {
    medicinesApi(mixed)
    cache(mixed)
    const { user, rerender } = renderAt('?archived')
    await user.click(await screen.findByRole('link', { name: /^Archived 2/ }))
    expect(window.location.search).toBe(`?medicine=${archived(2).id}`)
    rerender()
    expect(await screen.findByRole('heading', { level: 1, name: 'Archived 2' })).toBeVisible()
    expect(screen.getByText('Archived', { exact: true })).toBeVisible()
    expect(screen.getByText('Kept in History')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Archived medications' })).toHaveAttribute(
      'href',
      '/medications?archived',
    )
    expect(screen.getByRole('link', { name: 'Strength history' })).toBeVisible()
    for (const name of [/restore/i, /fix a mistake/i, /change strength/i, /archive medication/i])
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore medication' })).toBeVisible()
    for (const name of [/archive/i, /log a dose/i, /set schedule/i])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Set schedule' })).not.toBeInTheDocument()
  })

  test('schedule setup does not offer an Archived medicine', async () => {
    medicinesApi(mixed)
    cache(mixed)
    renderAt(`?schedule=${archived(2).id}`)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      "This medication isn't in your list",
    )
  })

  test('a failed refresh keeps the archived list with Retry', async () => {
    const api = medicinesApi(mixed)
    api.failNext()
    cache(mixed, stale)
    const { user } = renderAt('?archived')
    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(
      screen.getByText('Couldn’t update medications. Showing previously loaded details.'),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: /^Archived 2/ })).toBeVisible()
    await user.click(retry)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument(),
    )
    expect(api.reads()).toBe(2)
  })

  test('a failed first read shows a recoverable Alert', async () => {
    const api = medicinesApi(mixed)
    api.failNext()
    const { user } = renderAt('?archived')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Your archived medications didn't load just now.",
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: /^Archived 2/ })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
