import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import type { MedicineRecord } from '@/features/medicines/contract'
import { MedicationsScreen } from '@/features/medicines/medications-screen'
import { medicineKeys } from '@/features/medicines/queries'
import { scheduleKeys, type ScheduleSnapshot } from '@/features/schedules/queries'
import { createQueryClient } from '@/lib/session-query-client'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

const now = '2035-06-15T06:00:00.000Z'
const tablets: MedicineRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Magnesium',
  unit: 'tablet',
  strength: '400 mg',
  stock: { tracked: false },
  revision: 1,
  everHadSchedule: true,
  everHadDose: false,
  lastActionId: null,
  latestTakenAt: null,
  archivedAt: null,
  currentStrengthRevisionId: '22222222-2222-4222-8222-222222222222',
  strengthRevisions: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      label: 'Magnesium',
      unit: 'tablet',
      strength: '400 mg',
      effectiveAt: '2035-06-01T00:00:00.000Z',
      previousValues: [],
    },
  ],
}
const capsules: MedicineRecord = {
  ...tablets,
  label: 'Omega-3',
  unit: 'capsule',
  strength: '1000 mg',
  strengthRevisions: [{ ...tablets.strengthRevisions[0], label: 'Omega-3', unit: 'capsule' }],
}
const snapshot: ScheduleSnapshot = { schedules: [], records: [], date: '2035-06-15', now }

type StockRequest = {
  operation: 'stockOn' | 'stockOff'
  stock: { actionId: string; expectedRevision: number; startingCount?: number }
}
/** The Worker's receipt: revision + 1, this action, the requested stock. */
function receipt(medicine: MedicineRecord, body: StockRequest): MedicineRecord {
  return {
    ...medicine,
    revision: body.stock.expectedRevision + 1,
    lastActionId: body.stock.actionId,
    stock:
      body.operation === 'stockOn'
        ? { tracked: true, count: body.stock.startingCount! }
        : { tracked: false },
  }
}

function open(medicine: MedicineRecord) {
  server.use(
    http.get('/api/schedules', () =>
      HttpResponse.json({ schedules: [], records: [], today: { date: snapshot.date, now } }),
    ),
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
  )
  const client = createQueryClient()
  client.setQueryData(medicineKeys.list(), [medicine])
  client.setQueryData(scheduleKeys.snapshot(), snapshot)
  window.history.replaceState(null, '', `/medications?medicine=${medicine.id}`)
  const view = render(
    <QueryClientProvider client={client}>
      <MedicationsScreen initialNow={now} serverEntry />
    </QueryClientProvider>,
  )
  return { ...view, client, user: userEvent.setup() }
}

/** Answers stock saves like the Worker, recording each request. */
function confirmingServer(medicine: MedicineRecord) {
  const requests: StockRequest[] = []
  let current = medicine
  server.use(
    http.patch('/api/medicines', async ({ request }) => {
      const body = (await request.json()) as StockRequest
      requests.push(body)
      current = receipt(current, body)
      return HttpResponse.json({ medicines: [current] })
    }),
  )
  return requests
}

// A modal drawer hides the page from the accessibility tree; the card stays rendered behind it.
const stock = () => screen.getByRole('region', { name: 'Stock', hidden: true })
const onDrawer = (label = 'Magnesium') =>
  screen.getByRole('dialog', { name: `Track ${label} stock` })
const countField = (label?: string) =>
  within(onDrawer(label)).getByRole('textbox', { name: 'Starting count' })

test('stock off shows Track stock; the turn-on drawer saves a starting count that then shows as the count', async () => {
  const requests = confirmingServer(tablets)
  const { client, user, unmount } = open(tablets)
  expect(within(stock()).getByText('Not tracking stock')).toBeVisible()
  expect(
    within(stock()).getByText('Add how many tablets you have to see the count here.'),
  ).toBeVisible()
  await user.click(within(stock()).getByRole('button', { name: 'Track stock' }))
  expect(within(onDrawer()).getByText('How many tablets do you have now?')).toBeVisible()
  expect(within(onDrawer()).getByText('Shows on this page and in Medications.')).toBeVisible()
  await user.type(countField(), '30')
  await user.click(within(onDrawer()).getByRole('button', { name: 'Start tracking' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(within(stock()).getByText('30')).toBeVisible()
  expect(within(stock()).getByText('tablets left')).toBeVisible()
  expect(within(stock()).getByRole('button', { name: 'Stop tracking' })).toBeVisible()
  expect(requests).toEqual([
    {
      operation: 'stockOn',
      stock: expect.objectContaining({
        medicineId: tablets.id,
        expectedRevision: 1,
        unit: 'tablet',
        startingCount: 30,
      }),
    },
  ])
  unmount()
  client.clear()
})

test('the drawer accepts 12.5 tablets and 0, and shows "Use whole capsules." for 7.5 capsules', async () => {
  const requests = confirmingServer(tablets)
  const first = open(tablets)
  await first.user.click(screen.getByRole('button', { name: 'Track stock' }))
  await first.user.type(countField(), '12.5')
  await first.user.click(within(onDrawer()).getByRole('button', { name: 'Start tracking' }))
  await waitFor(() => expect(within(stock()).getByText('12½')).toBeVisible())
  expect(requests.at(-1)?.stock.startingCount).toBe(12.5)
  first.unmount()
  first.client.clear()

  // Zero, reached with the stepper: it steps down past the dose minimum to 0.
  confirmingServer(tablets)
  const second = open(tablets)
  await second.user.click(screen.getByRole('button', { name: 'Track stock' }))
  await second.user.type(countField(), '½')
  await second.user.click(within(onDrawer()).getByRole('button', { name: 'Fewer: Starting count' }))
  expect(countField()).toHaveValue('0')
  expect(within(onDrawer()).getByRole('button', { name: 'Fewer: Starting count' })).toBeDisabled()
  expect(document.getElementById(`stock-count-${tablets.id}-unit`)).toHaveTextContent('tablets')
  await second.user.click(within(onDrawer()).getByRole('button', { name: 'Start tracking' }))
  await waitFor(() => expect(within(stock()).getByText('0')).toBeVisible())
  expect(within(stock()).getByText('tablets left')).toBeVisible()
  second.unmount()
  second.client.clear()

  const capsuleRequests = confirmingServer(capsules)
  const third = open(capsules)
  await third.user.click(screen.getByRole('button', { name: 'Track stock' }))
  await third.user.type(countField('Omega-3'), '7.5')
  await third.user.click(
    within(onDrawer('Omega-3')).getByRole('button', { name: 'Start tracking' }),
  )
  expect(await within(onDrawer('Omega-3')).findByText('Use whole capsules.')).toBeVisible()
  expect(countField('Omega-3')).toHaveAttribute('aria-invalid', 'true')
  expect(capsuleRequests).toEqual([])
  third.unmount()
  third.client.clear()
})

test('Stop tracking asks first; starting again opens the drawer with the count field empty', async () => {
  const tracked: MedicineRecord = { ...tablets, stock: { tracked: true, count: 24 } }
  const requests = confirmingServer(tracked)
  const { client, user, unmount } = open(tracked)
  expect(within(stock()).getByText('24')).toBeVisible()
  await user.click(within(stock()).getByRole('button', { name: 'Stop tracking' }))
  const confirm = screen.getByRole('dialog', { name: 'Stop tracking Magnesium stock?' })
  expect(
    within(confirm).getByText(
      'Meddies stops counting Magnesium. To track again, you’ll enter a fresh count.',
    ),
  ).toBeVisible()
  expect(requests).toEqual([])
  await user.click(within(confirm).getByRole('button', { name: 'Stop tracking' }))
  await waitFor(() => expect(within(stock()).getByText('Not tracking stock')).toBeVisible())
  expect(requests.map((request) => request.operation)).toEqual(['stockOff'])
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

  await user.click(within(stock()).getByRole('button', { name: 'Track stock' }))
  expect(countField()).toHaveValue('')
  // Dismissing a typed count discards it: the next open is empty too.
  await user.type(countField(), '9')
  await user.click(within(onDrawer()).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await user.click(within(stock()).getByRole('button', { name: 'Track stock' }))
  expect(countField()).toHaveValue('')
  unmount()
  client.clear()
})

test('the count shows only after the server confirms; the primary reads its saving label while pending and a failed save keeps the drawer open with its alert', async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let mode: 'fail' | 'hold' = 'fail'
  server.use(
    http.patch('/api/medicines', async ({ request }) => {
      const body = (await request.json()) as StockRequest
      if (mode === 'fail') return HttpResponse.json({}, { status: 500 })
      await held
      return HttpResponse.json({ medicines: [receipt(tablets, body)] })
    }),
  )
  const { client, user, unmount } = open(tablets)
  await user.click(screen.getByRole('button', { name: 'Track stock' }))
  await user.type(countField(), '30')
  await user.click(within(onDrawer()).getByRole('button', { name: 'Start tracking' }))
  // A failed start keeps the drawer, its typed count and the might-not-have-saved alert.
  expect(await within(onDrawer()).findByText('That might not have saved.')).toBeVisible()
  expect(countField()).toHaveValue('30')
  expect(within(stock()).getByText('Not tracking stock')).toBeInTheDocument()

  mode = 'hold'
  await user.click(within(onDrawer()).getByRole('button', { name: 'Try saving count again' }))
  expect(await within(onDrawer()).findByRole('button', { name: 'Saving count...' })).toBeDisabled()
  expect(countField()).toBeDisabled()
  expect(within(onDrawer()).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  // Nothing optimistic: the card still reads stock off behind the drawer.
  expect(within(stock()).getByText('Not tracking stock')).toBeInTheDocument()
  expect(within(stock()).queryByText('tablets left')).toBeNull()
  release()
  await waitFor(() => expect(within(stock()).getByText('tablets left')).toBeInTheDocument())

  // A failed stop keeps the confirm open with its alert and retry label.
  mode = 'fail'
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await user.click(within(stock()).getByRole('button', { name: 'Stop tracking' }))
  const confirm = screen.getByRole('dialog', { name: 'Stop tracking Magnesium stock?' })
  await user.click(within(confirm).getByRole('button', { name: 'Stop tracking' }))
  expect(await within(confirm).findByText('That might not have saved.')).toBeVisible()
  expect(within(confirm).getByRole('button', { name: 'Retry stop' })).toBeEnabled()
  expect(within(stock()).getByText('tablets left')).toBeInTheDocument()
  unmount()
  client.clear()
})

test('Archived medication detail shows the count read-only with no stock actions', async () => {
  const archived: MedicineRecord = {
    ...tablets,
    archivedAt: now,
    stock: { tracked: true, count: 12.5 },
  }
  const { client, unmount } = open(archived)
  expect(await screen.findByText('Archived')).toBeVisible()
  expect(within(stock()).getByText('12½')).toBeVisible()
  expect(within(stock()).getByText('tablets left')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Stop tracking' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Track stock' })).toBeNull()
  unmount()
  client.clear()

  // Stock off on an Archived medicine shows no Stock section at all.
  const untracked = open({ ...archived, stock: { tracked: false } })
  expect(await screen.findByText('Archived')).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Stock' })).toBeNull()
  untracked.unmount()
  untracked.client.clear()
})
