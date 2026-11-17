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
import { scheduleToday } from '@/features/schedules/occurrences'
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
const medicine = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Magnesium',
  unit: 'tablet' as const,
  strength: '400 mg',
  revision: 1,
  everHadSchedule: true,
  everHadDose: false,
  lastActionId: null as string | null,
  latestTakenAt: null,
  archivedAt: null as string | null,
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
const schedule = {
  id: '33333333-3333-4333-8333-333333333333',
  medicineId: medicine.id,
  startDate: '2035-06-01',
  times: [{ time: '20:00', quantity: 1 }],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  confirmedAt: '2035-06-01T00:00:00.000Z',
}
const snapshot: ScheduleSnapshot = { schedules: [schedule], records: [], date: '2035-06-15', now }
const archived = (attempt: Record<string, unknown>) => ({
  ...medicine,
  revision: (attempt.expectedRevision as number) + 1,
  lastActionId: attempt.actionId as string,
  archivedAt: now,
})

function open(existingClient?: QueryClient) {
  server.use(
    http.get('/api/schedules', () =>
      HttpResponse.json({
        schedules: [schedule],
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
const drawer = () => screen.getByRole('dialog', { name: 'Archive Magnesium?' })
const archiveAction = () => screen.getByRole('button', { name: 'Archive medication' })
const confirmAction = () => within(drawer()).getByRole('button', { name: /archive/i })
const overlay = () => document.querySelector<HTMLElement>('[data-slot="drawer-overlay"]')!

test('Archive confirmation mounts closed so its first open can animate', async () => {
  const { client, user, unmount } = open()
  drawerMounts.length = 0
  await user.click(archiveAction())
  expect(drawer()).toBeVisible()
  expect(drawerMounts).toEqual([false])
  unmount()
  client.clear()
})

test('Archive medication opens the confirmation; Close, Escape, backdrop and Cancel discard it', async () => {
  const attempts: unknown[] = []
  server.use(
    http.patch('/api/medicines', async ({ request }) => {
      attempts.push(await request.json())
      return HttpResponse.json({}, { status: 500 })
    }),
  )
  const { client, user, unmount } = open()
  for (const dismiss of [
    () => user.click(screen.getByRole('button', { name: 'Close' })),
    () => user.keyboard('{Escape}'),
    () => user.click(overlay()),
    () => user.click(within(drawer()).getByRole('button', { name: 'Cancel' })),
  ]) {
    await user.click(archiveAction())
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Archive Magnesium?' })).toHaveFocus(),
    )
    expect(
      within(drawer()).getByText(
        'Moves to Archived medications and stops the schedule. Unsent reminders are cancelled. History and stock stay unchanged. You can restore it later.',
      ),
    ).toBeVisible()
    await dismiss()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(archiveAction()).toHaveFocus())
  }
  expect(attempts).toHaveLength(0)
  expect(client.getQueryData(medicineKeys.list())).toEqual([medicine])
  unmount()
  client.clear()
})

test('known offline blocks, rejection keeps the Drawer, and a pending archive refuses dismissal until it opens the archived detail', async () => {
  let phase = 'rejected'
  const attempts: Record<string, unknown>[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get('/api/medicines', () =>
      HttpResponse.json({ medicines: [phase === 'saved' ? archived(attempts[1]) : medicine] }),
    ),
    http.patch('/api/medicines', async ({ request }) => {
      const { archive } = (await request.json()) as { archive: Record<string, unknown> }
      attempts.push(archive)
      if (phase === 'rejected') return HttpResponse.json({}, { status: 400 })
      await gate
      phase = 'saved'
      return HttpResponse.json({ medicines: [archived(archive)] })
    }),
  )
  const { client, user, unmount } = open()
  await user.click(archiveAction())
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  fireEvent(window, new Event('offline'))
  expect(await screen.findByRole('button', { name: 'Connect to save' })).toBeDisabled()
  online.mockReturnValue(true)
  fireEvent(window, new Event('online'))
  expect(attempts).toHaveLength(0)
  await user.click(confirmAction())
  expect(await screen.findByText('Medication wasn’t archived.')).toBeVisible()
  expect(drawer()).toBeVisible()
  expect(client.getQueryData(medicineKeys.list())).toEqual([medicine])
  expect(client.getQueryData(scheduleKeys.snapshot())).toEqual(snapshot)

  phase = 'success'
  await user.click(confirmAction())
  expect(await screen.findByRole('button', { name: 'Archiving...' })).toBeDisabled()
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
  // Same URL, now the read-only archived detail.
  expect(window.location.search).toBe(`?medicine=${medicine.id}`)
  expect(screen.getByRole('link', { name: /Archived medications/ })).toBeVisible()
  expect(screen.getByText('Kept in History')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Archive medication' })).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Magnesium' })).toHaveFocus())
  expect(attempts).toHaveLength(2)
  expect(attempts[1]).toMatchObject({ medicineId: medicine.id, expectedRevision: 1 })
  expect(attempts[1].actionId).not.toBe(attempts[0].actionId)
  unmount()
  client.clear()
  online.mockRestore()
})

test('an Unconfirmed archive retries the same attempt, reconciles on its receipt, and a stale revision reviews saved facts', async () => {
  let phase = 'conflict'
  const attempts: Record<string, unknown>[] = []
  let list: Medicine[] = [{ ...medicine, revision: 2 }]
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: list })),
    http.patch('/api/medicines', async ({ request }) => {
      const { archive } = (await request.json()) as { archive: Record<string, unknown> }
      attempts.push(archive)
      if (phase === 'conflict') return HttpResponse.json({}, { status: 409 })
      if (phase === 'lost') return HttpResponse.json({}, { status: 503 })
      if (phase === 'success') list = [archived(archive)]
      if (phase === 'mismatch')
        return HttpResponse.json({
          medicines: [archived({ ...archive, actionId: '44444444-4444-4444-8444-444444444444' })],
        })
      return HttpResponse.json({ medicines: [archived(archive)] })
    }),
  )
  const { client, user, unmount } = open()
  await user.click(archiveAction())
  await user.click(confirmAction())
  expect(await screen.findByText('This medication changed elsewhere.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Review saved medication' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(client.getQueryData<Medicine[]>(medicineKeys.list())?.[0].revision).toBe(2)

  // A receipt for another action is not this archive's.
  phase = 'mismatch'
  await user.click(archiveAction())
  await user.click(confirmAction())
  expect(await screen.findByText('That might not have saved.')).toBeVisible()
  expect(client.getQueryData<Medicine[]>(medicineKeys.list())?.[0].archivedAt).toBeNull()
  // A newer read must not rebase the retry.
  list = [{ ...medicine, revision: 3 }]
  await act(async () => {
    await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
  })
  phase = 'success'
  await user.click(screen.getByRole('button', { name: 'Retry archive' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(attempts[2]).toEqual(attempts[1])
  expect(attempts[1]).toMatchObject({ expectedRevision: 2 })
  expect(screen.getByText('Kept in History')).toBeVisible()
  unmount()
  client.clear()

  // A lost response reconciles when the read shows this action's archived record.
  const second = createQueryClient()
  second.setQueryData(medicineKeys.list(), [medicine])
  second.setQueryData(scheduleKeys.snapshot(), snapshot)
  attempts.length = 0
  phase = 'lost'
  list = [medicine]
  server.use(
    http.get('/api/medicines', () =>
      HttpResponse.json({
        medicines: attempts.length ? [archived(attempts[0])] : list,
      }),
    ),
  )
  const again = open(second)
  await again.user.click(archiveAction())
  await again.user.click(confirmAction())
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(attempts).toHaveLength(1)
  expect(screen.getByText('Kept in History')).toBeVisible()
  const stopped = second.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())!
  expect(scheduleToday(stopped.schedules, new Date(now), stopped.records).next).toBeNull()
  again.unmount()
  second.clear()
})
