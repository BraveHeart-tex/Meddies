import { useRef } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { MedicationsScreen } from '@/features/medicines/medications-screen'
import { medicineKeys, medicinesQuery } from '@/features/medicines/queries'
import type { Medicine } from '@/features/medicines/contract'
import { scheduleKeys, type ScheduleSnapshot } from '@/features/schedules/queries'
import { createQueryClient } from '@/lib/session-query-client'
import { server } from './helpers/msw-server'

// Observe the external Drawer boundary without replacing its behavior.
const drawerMounts = vi.hoisted(() => [] as boolean[])
vi.mock('@base-ui/react/drawer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@base-ui/react/drawer')>()
  return {
    ...actual,
    Drawer: {
      ...actual.Drawer,
      Root: (props: React.ComponentProps<typeof actual.Drawer.Root>) => {
        const first = useRef(true)
        if (first.current) {
          drawerMounts.push(Boolean(props.open))
          first.current = false
        }
        return <actual.Drawer.Root {...props} />
      },
    },
  }
})

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
const now = '2035-06-15T06:00:00.000Z'
const archivedAt = '2035-06-10T06:00:00.000Z'
const stopId = '44444444-4444-4444-8444-444444444444'
const medicine = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Magnesium',
  unit: 'tablet' as const,
  strength: '400 mg',
  revision: 2,
  everHadSchedule: true,
  everHadDose: false,
  lastActionId: stopId as string | null,
  latestTakenAt: null,
  archivedAt: archivedAt as string | null,
  currentStrengthRevisionId: '22222222-2222-4222-8222-222222222222',
  strengthRevisions: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      label: 'Magnesium',
      unit: 'tablet' as const,
      strength: '400 mg',
      effectiveAt: '2035-06-01T00:00:00.000Z',
      previousValues: [],
    },
  ],
}
const base = {
  id: '33333333-3333-4333-8333-333333333333',
  medicineId: medicine.id,
  startDate: '2035-06-01',
  times: [{ time: '20:00', quantity: 1 }],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  confirmedAt: '2035-06-01T00:00:00.000Z',
  replacedAt: archivedAt,
}
// The archive's stop version stays the head after restore.
const stop = {
  ...base,
  id: stopId,
  basedOnId: base.id,
  confirmedAt: archivedAt,
  stoppedAt: archivedAt,
  replacedAt: null,
  archiveStop: true,
}
const snapshot: ScheduleSnapshot = {
  schedules: [base, stop],
  records: [],
  date: '2035-06-15',
  now,
}
const restored = (attempt: Record<string, unknown>) => ({
  ...medicine,
  revision: (attempt.expectedRevision as number) + 1,
  lastActionId: attempt.actionId as string,
  archivedAt: null,
})

function open(existingClient?: QueryClient) {
  server.use(
    http.get('/api/schedules', () =>
      HttpResponse.json({
        schedules: snapshot.schedules,
        records: [],
        today: { date: snapshot.date, now },
      }),
    ),
  )
  const client = existingClient ?? createQueryClient()
  if (!existingClient) {
    client.setQueryData(medicineKeys.list(), [medicine])
    client.setQueryData(scheduleKeys.snapshot(), snapshot)
  }
  window.history.replaceState(null, '', `/medications?medicine=${medicine.id}`)
  const view = render(
    <QueryClientProvider client={client}>
      <MedicationsScreen initialNow={now} serverEntry />
    </QueryClientProvider>,
  )
  return { ...view, client, user: userEvent.setup() }
}
const drawer = () => screen.getByRole('dialog', { name: 'Restore Magnesium?' })
const restoreAction = () => screen.getByRole('button', { name: 'Restore medication' })
const confirmAction = () => within(drawer()).getByRole('button', { name: /restor/i })
const overlay = () => document.querySelector<HTMLElement>('[data-slot="drawer-overlay"]')!

function expectRestoredDetail() {
  // 292·S9: the notice, No schedule, Log a dose first and Set schedule separately.
  expect(screen.getByRole('status', { name: 'Restored medication' })).toHaveTextContent(
    'Magnesium restoredNo schedule has restarted. Set one when you’re ready.',
  )
  expect(screen.getByText('No schedule', { exact: true })).toBeVisible()
  expect(screen.queryByText('Kept in History')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /^Medications$/ })).toBeVisible()
  const logDose = screen.getByRole('button', { name: 'Log a dose' })
  const set = screen.getByRole('link', { name: 'Set schedule' })
  // eslint-disable-next-line meddies/no-cosmetic-class-assertions -- primary vs secondary is the criterion
  expect(logDose).toHaveClass('bg-primary')
  expect(set).toHaveAttribute('href', `/medications?schedule=${medicine.id}#schedule-heading`)
  expect(logDose.compareDocumentPosition(set) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Change schedule' })).not.toBeInTheDocument()
}

test('Restore confirmation mounts closed so its first open can animate', async () => {
  const { client, user, unmount } = open()
  drawerMounts.length = 0
  await user.click(restoreAction())
  expect(drawer()).toBeVisible()
  expect(drawerMounts).toEqual([false])
  unmount()
  client.clear()
})

test('Restore medication opens the 292·S8 confirmation; Close, Escape, backdrop and Cancel discard it', async () => {
  const attempts: unknown[] = []
  server.use(
    http.patch('/api/medicines', async ({ request }) => {
      attempts.push(await request.json())
      return HttpResponse.json({}, { status: 500 })
    }),
  )
  const { client, user, unmount } = open()
  expect(screen.getByText('Kept in History')).toBeVisible()
  for (const dismiss of [
    () => user.click(screen.getByRole('button', { name: 'Close' })),
    () => user.keyboard('{Escape}'),
    () => user.click(overlay()),
    () => user.click(within(drawer()).getByRole('button', { name: 'Cancel' })),
  ]) {
    await user.click(restoreAction())
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Restore Magnesium?' })).toHaveFocus(),
    )
    expect(
      within(drawer()).getByText(
        'Returns to Medications. Its schedule and reminders won’t restart.',
      ),
    ).toBeVisible()
    await dismiss()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(restoreAction()).toHaveFocus())
  }
  expect(attempts).toHaveLength(0)
  expect(client.getQueryData(medicineKeys.list())).toEqual([medicine])
  unmount()
  client.clear()
})

test('known offline blocks, rejection keeps the Drawer, and a pending restore refuses dismissal until it opens the 292·S9 restored detail', async () => {
  let phase = 'rejected'
  const attempts: Record<string, unknown>[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get('/api/medicines', () =>
      HttpResponse.json({ medicines: [phase === 'saved' ? restored(attempts[1]) : medicine] }),
    ),
    http.patch('/api/medicines', async ({ request }) => {
      const body = (await request.json()) as {
        operation: string
        restore: Record<string, unknown>
      }
      expect(body.operation).toBe('restore')
      attempts.push(body.restore)
      if (phase === 'rejected') return HttpResponse.json({}, { status: 400 })
      await gate
      phase = 'saved'
      return HttpResponse.json({ medicines: [restored(body.restore)] })
    }),
  )
  const { client, user, unmount } = open()
  await user.click(restoreAction())
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  fireEvent(window, new Event('offline'))
  expect(await screen.findByRole('button', { name: 'Connect to save' })).toBeDisabled()
  online.mockReturnValue(true)
  fireEvent(window, new Event('online'))
  expect(attempts).toHaveLength(0)
  await user.click(confirmAction())
  expect(await screen.findByText('Medication wasn’t restored.')).toBeVisible()
  expect(drawer()).toBeVisible()
  expect(client.getQueryData(medicineKeys.list())).toEqual([medicine])

  phase = 'success'
  await user.click(confirmAction())
  expect(await screen.findByRole('button', { name: 'Restoring...' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  expect(within(drawer()).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await user.keyboard('{Escape}')
  await user.click(overlay())
  expect(drawer()).toBeVisible()
  expect(client.getQueryData(medicineKeys.list())).toEqual([medicine])
  await act(async () => {
    release()
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  // Same URL, now the restored detail.
  expect(window.location.search).toBe(`?medicine=${medicine.id}`)
  expectRestoredDetail()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Magnesium' })).toHaveFocus())
  expect(attempts).toHaveLength(2)
  expect(attempts[1]).toMatchObject({ medicineId: medicine.id, expectedRevision: 2 })
  expect(attempts[1].actionId).not.toBe(attempts[0].actionId)
  unmount()
  client.clear()
  online.mockRestore()
})

test('an Unconfirmed restore retries the same attempt, reconciles on its receipt, and a stale revision reviews saved facts', async () => {
  let phase = 'conflict'
  const attempts: Record<string, unknown>[] = []
  let list: Medicine[] = [{ ...medicine, revision: 3 }]
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: list })),
    http.patch('/api/medicines', async ({ request }) => {
      const { restore } = (await request.json()) as { restore: Record<string, unknown> }
      attempts.push(restore)
      if (phase === 'conflict') return HttpResponse.json({}, { status: 409 })
      if (phase === 'lost') return HttpResponse.json({}, { status: 503 })
      if (phase === 'success') list = [restored(restore)]
      if (phase === 'mismatch')
        return HttpResponse.json({
          medicines: [restored({ ...restore, actionId: '55555555-5555-4555-8555-555555555555' })],
        })
      return HttpResponse.json({ medicines: [restored(restore)] })
    }),
  )
  const { client, user, unmount } = open()
  await user.click(restoreAction())
  await user.click(confirmAction())
  expect(await screen.findByText('This medication changed elsewhere.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Review saved medication' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(client.getQueryData<Medicine[]>(medicineKeys.list())?.[0].revision).toBe(3)

  // A receipt for another action is not this restore's.
  phase = 'mismatch'
  await user.click(restoreAction())
  await user.click(confirmAction())
  expect(await screen.findByText('That might not have saved.')).toBeVisible()
  expect(client.getQueryData<Medicine[]>(medicineKeys.list())?.[0].archivedAt).toBe(archivedAt)
  // A newer read must not rebase the retry.
  list = [{ ...medicine, revision: 4 }]
  await act(async () => {
    await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
  })
  phase = 'success'
  await user.click(screen.getByRole('button', { name: 'Retry restore' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(attempts[2]).toEqual(attempts[1])
  expect(attempts[1]).toMatchObject({ expectedRevision: 3 })
  expectRestoredDetail()
  unmount()
  client.clear()

  // A lost response reconciles when the read shows this action's restored record.
  const second = createQueryClient()
  second.setQueryData(medicineKeys.list(), [medicine])
  second.setQueryData(scheduleKeys.snapshot(), snapshot)
  attempts.length = 0
  phase = 'lost'
  server.use(
    http.get('/api/medicines', () =>
      HttpResponse.json({ medicines: attempts.length ? [restored(attempts[0])] : [medicine] }),
    ),
  )
  const again = open(second)
  await again.user.click(restoreAction())
  await again.user.click(confirmAction())
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(attempts).toHaveLength(1)
  expectRestoredDetail()
  again.unmount()
  second.clear()
})
