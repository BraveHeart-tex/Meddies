import { useRef } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { MedicationsScreen } from '@/features/medicines/medications-screen'
import { medicineKeys, medicinesQuery } from '@/features/medicines/queries'
import { scheduleKeys } from '@/features/schedules/queries'
import { createQueryClient } from '@/lib/session-query-client'
import { Toaster } from '@/components/ui/toast'
import { findConfirmation } from './helpers/toasts'
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
  label: 'Vitamin D',
  unit: 'tablet' as const,
  strength: null,
  revision: 1,
  everHadSchedule: false,
  everHadDose: false,
  lastActionId: null,
  latestTakenAt: null,
  archivedAt: null,
  currentStrengthRevisionId: '22222222-2222-4222-8222-222222222222',
  strengthRevisions: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      label: 'Vitamin D',
      unit: 'tablet',
      strength: null,
      effectiveAt: '2035-06-01T00:00:00.000Z',
      previousValues: [],
    },
  ],
}
function open(
  record: typeof medicine | Omit<typeof medicine, 'everHadSchedule' | 'everHadDose'> = medicine,
  existingClient?: QueryClient,
  view = '&manage',
) {
  server.use(
    http.get('/api/schedules', () =>
      HttpResponse.json({ schedules: [], records: [], date: '2035-06-15', now }),
    ),
  )
  const client = existingClient ?? createQueryClient()
  if (!existingClient) client.setQueryData(medicineKeys.list(), [record])
  client.setQueryData(scheduleKeys.snapshot(), {
    schedules: [],
    records: [],
    date: '2035-06-15',
    now,
  })
  // Delete medication lives on Manage (403·B14).
  window.history.replaceState(null, '', `/medications?medicine=${medicine.id}${view}`)
  const screenView = render(
    <QueryClientProvider client={client}>
      <Toaster>
        <MedicationsScreen initialNow={now} serverEntry />
      </Toaster>
    </QueryClientProvider>,
  )
  return { ...screenView, client, user: userEvent.setup() }
}
const drawer = () => screen.getByRole('dialog', { name: 'Delete Vitamin D?' })
const deleteAction = () => screen.getByRole('button', { name: 'Delete medication' })
const overlay = () => document.querySelector<HTMLElement>('[data-slot="drawer-overlay"]')!

test('Delete confirmation mounts closed so its first open can animate', async () => {
  const { client, user, unmount } = open()
  drawerMounts.length = 0
  await user.click(deleteAction())
  expect(drawer()).toBeVisible()
  expect(drawerMounts).toEqual([false])
  unmount()
  client.clear()
})

test('only explicitly unused Medicines offer Delete, through Manage; dismissal discards confirmation and keyboard focus returns', async () => {
  for (const flags of [
    { everHadSchedule: true },
    { everHadDose: true },
    { everHadSchedule: undefined, everHadDose: undefined },
  ]) {
    const { unmount, client } = open({ ...medicine, ...flags })
    expect(screen.getByRole('button', { name: 'Archive medication' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Delete medication' })).not.toBeInTheDocument()
    unmount()
    client.clear()
  }
  // #405: the summary offers no Delete, only the Manage medication row leading to it.
  const summary = open(medicine, undefined, '')
  expect(screen.queryByRole('button', { name: 'Delete medication' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Manage medication' })).toHaveAttribute(
    'href',
    `/medications?medicine=${medicine.id}&manage`,
  )
  summary.unmount()
  summary.client.clear()
  const { client, user, unmount } = open()
  for (const dismiss of [
    () => user.click(screen.getByRole('button', { name: 'Close' })),
    () => user.keyboard('{Escape}'),
    () => user.click(overlay()),
  ]) {
    await user.click(deleteAction())
    expect(
      within(drawer()).getByText(
        'This medication has never had a schedule or a dose. Deleting it cannot be undone.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    await dismiss()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Delete Vitamin D?' })).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(deleteAction()).toHaveFocus())
  }
  unmount()
  client.clear()
})

test('offline, rejection, conflict review and unknown receipts preserve the record until the matching retry confirms deletion', async () => {
  let phase = 'rejected'
  const attempts: Record<string, unknown>[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get('/api/medicines', () =>
      HttpResponse.json({ medicines: phase === 'unknown' ? [] : [{ ...medicine, revision: 2 }] }),
    ),
    http.patch('/api/medicines', async ({ request }) => {
      const { deletion } = (await request.json()) as { deletion: Record<string, unknown> }
      attempts.push(deletion)
      if (phase === 'rejected') return HttpResponse.json({}, { status: 400 })
      if (phase === 'conflict') return HttpResponse.json({}, { status: 409 })
      if (phase === 'unknown')
        return HttpResponse.json({
          deletion: {
            ...deletion,
            actionId: '22222222-2222-4222-8222-222222222222',
            deletedAt: now,
          },
        })
      await gate
      return HttpResponse.json({ deletion: { ...deletion, deletedAt: now } })
    }),
  )
  const { client, user, unmount } = open()
  await user.click(deleteAction())
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  fireEvent(window, new Event('offline'))
  expect(await screen.findByRole('button', { name: 'Connect to save' })).toBeDisabled()
  expect(attempts).toHaveLength(0)
  online.mockReturnValue(true)
  fireEvent(window, new Event('online'))
  expect(attempts).toHaveLength(0)
  await user.click(deleteAction())
  expect(await screen.findByText('Medication wasn’t deleted.')).toBeVisible()
  expect(client.getQueryData(medicineKeys.list())).toEqual([medicine])
  phase = 'conflict'
  await user.click(deleteAction())
  await user.click(await screen.findByRole('button', { name: 'Review saved medication' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Delete Vitamin D?' })).not.toBeInTheDocument(),
  )
  phase = 'unknown'
  await user.click(deleteAction())
  await user.click(within(drawer()).getByRole('button', { name: 'Delete medication' }))
  expect(await screen.findByText('That might not have saved.')).toBeVisible()
  await act(async () => {
    await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
  })
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(window.location.search).toContain(medicine.id)
  unmount()
  client.setQueryData(medicineKeys.list(), [{ ...medicine, revision: 3 }])
  const returned = open(medicine, client)
  await returned.user.click(deleteAction())
  phase = 'success'
  await user.click(screen.getByRole('button', { name: 'Retry delete' }))
  expect(await screen.findByRole('button', { name: 'Deleting...' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await user.keyboard('{Escape}')
  await user.click(overlay())
  expect(drawer()).toBeVisible()
  expect(screen.queryByText('Vitamin D deleted')).not.toBeInTheDocument()
  await act(async () => {
    release()
  })
  await waitFor(() => expect(window.location.search).toBe(''))
  // #377: the deletion Toast on Medications, no glyph.
  await findConfirmation('Vitamin D deleted', 'none', 'This medication had no schedule or doses.')
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'View details for Vitamin D' })).not.toBeInTheDocument()
  expect(attempts[2]).toMatchObject({ medicineId: medicine.id, expectedRevision: 2 })
  expect(attempts[3]).toEqual(attempts[2])
  returned.unmount()
  client.clear()
  online.mockRestore()
})
