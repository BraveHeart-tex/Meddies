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
  operation: 'stockOn' | 'stockOff' | 'stockCorrection'
  stock: { actionId: string; expectedRevision: number; startingCount?: number; count?: number }
}
/** The Worker's receipt: revision + 1, this action, the requested stock. */
function receipt(medicine: MedicineRecord, body: StockRequest): MedicineRecord {
  return {
    ...medicine,
    revision: body.stock.expectedRevision + 1,
    lastActionId: body.stock.actionId,
    stock:
      body.operation === 'stockOff'
        ? { tracked: false }
        : { tracked: true, count: (body.stock.count ?? body.stock.startingCount)! },
  }
}

function open(medicine: MedicineRecord, detail = true) {
  server.use(
    http.get('/api/schedules', () =>
      HttpResponse.json({ schedules: [], records: [], today: { date: snapshot.date, now } }),
    ),
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
  )
  const client = createQueryClient()
  client.setQueryData(medicineKeys.list(), [medicine])
  client.setQueryData(scheduleKeys.snapshot(), snapshot)
  window.history.replaceState(
    null,
    '',
    detail ? `/medications?medicine=${medicine.id}` : '/medications',
  )
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

// A modal drawer hides the page from the accessibility tree; the row stays rendered behind it.
const stockRow = () => screen.getByRole('button', { name: 'Stock', hidden: true })
const onDrawer = (label = 'Magnesium') =>
  screen.getByRole('dialog', { name: `Track ${label} stock` })
const optionsDrawer = (label = 'Magnesium') =>
  screen.getByRole('dialog', { name: `${label} stock` })
const stopConfirm = () => screen.getByRole('dialog', { name: 'Stop tracking Magnesium stock?' })
const countField = (label?: string) =>
  within(onDrawer(label)).getByRole('textbox', { name: 'Starting count' })
const noDrawer = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

test('the Stock row reads "Not tracking" and opens the turn-on drawer; a confirmed count shows on the row and focus returns to it', async () => {
  const requests = confirmingServer(tablets)
  const { client, user, unmount } = open(tablets)
  expect(stockRow()).toHaveAccessibleDescription('Not tracking')
  // Dismissing returns focus to the row.
  await user.click(stockRow())
  expect(within(onDrawer()).getByText('How many tablets do you have now?')).toBeVisible()
  await user.click(within(onDrawer()).getByRole('button', { name: 'Close' }))
  await noDrawer()
  await waitFor(() => expect(stockRow()).toHaveFocus())

  await user.click(stockRow())
  expect(within(onDrawer()).getByText('Shows on this page and in Medications.')).toBeVisible()
  await user.type(countField(), '30')
  await user.click(within(onDrawer()).getByRole('button', { name: 'Start tracking' }))
  await noDrawer()
  expect(stockRow()).toHaveAccessibleDescription('30 tablets left')
  await waitFor(() => expect(stockRow()).toHaveFocus())
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
  await first.user.click(stockRow())
  await first.user.type(countField(), '12.5')
  await first.user.click(within(onDrawer()).getByRole('button', { name: 'Start tracking' }))
  await waitFor(() => expect(stockRow()).toHaveAccessibleDescription('12½ tablets left'))
  expect(requests.at(-1)?.stock.startingCount).toBe(12.5)
  first.unmount()
  first.client.clear()

  // Zero, reached with the stepper: it steps down past the dose minimum to 0.
  confirmingServer(tablets)
  const second = open(tablets)
  await second.user.click(stockRow())
  await second.user.type(countField(), '½')
  await second.user.click(within(onDrawer()).getByRole('button', { name: 'Fewer: Starting count' }))
  expect(countField()).toHaveValue('0')
  expect(within(onDrawer()).getByRole('button', { name: 'Fewer: Starting count' })).toBeDisabled()
  expect(document.getElementById(`stock-count-${tablets.id}-unit`)).toHaveTextContent('tablets')
  await second.user.click(within(onDrawer()).getByRole('button', { name: 'Start tracking' }))
  await waitFor(() => expect(stockRow()).toHaveAccessibleDescription('0 tablets left'))
  second.unmount()
  second.client.clear()

  const capsuleRequests = confirmingServer(capsules)
  const third = open(capsules)
  await third.user.click(stockRow())
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

test('while tracking, the Stock row opens the stock Drawer; dismissing it returns focus to the row', async () => {
  const tracked: MedicineRecord = { ...tablets, stock: { tracked: true, count: 24 } }
  confirmingServer(tracked)
  const { client, user, unmount } = open(tracked)
  expect(stockRow()).toHaveAccessibleDescription('24 tablets left')
  await user.click(stockRow())
  expect(optionsDrawer()).toHaveAccessibleDescription('24 tablets left')
  expect(within(optionsDrawer()).getByRole('button', { name: 'Stop tracking' })).toBeVisible()
  expect(screen.queryByRole('dialog', { name: 'Track Magnesium stock' })).toBeNull()
  await user.keyboard('{Escape}')
  await noDrawer()
  await waitFor(() => expect(stockRow()).toHaveFocus())
  unmount()
  client.clear()
})

test('Stop tracking opens the confirm; "Not tracking" shows only after the server confirms, then focus returns to the row and starting again opens an empty field', async () => {
  const tracked: MedicineRecord = { ...tablets, stock: { tracked: true, count: 24 } }
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  const requests: StockRequest[] = []
  server.use(
    http.patch('/api/medicines', async ({ request }) => {
      const body = (await request.json()) as StockRequest
      requests.push(body)
      await held
      return HttpResponse.json({ medicines: [receipt(tracked, body)] })
    }),
  )
  const { client, user, unmount } = open(tracked)
  await user.click(stockRow())
  await user.click(within(optionsDrawer()).getByRole('button', { name: 'Stop tracking' }))
  expect(
    within(stopConfirm()).getByText(
      'Meddies stops counting Magnesium. To track again, you’ll enter a fresh count.',
    ),
  ).toBeVisible()
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Magnesium stock' })).toBeNull())
  expect(requests).toEqual([])
  await user.click(within(stopConfirm()).getByRole('button', { name: 'Stop tracking' }))
  expect(await within(stopConfirm()).findByRole('button', { name: 'Stopping...' })).toBeDisabled()
  // Nothing optimistic: the row keeps the confirmed count while the save is pending.
  expect(stockRow()).toHaveAccessibleDescription('24 tablets left')
  release()
  await waitFor(() => expect(stockRow()).toHaveAccessibleDescription('Not tracking'))
  expect(requests.map((request) => request.operation)).toEqual(['stockOff'])
  await noDrawer()
  await waitFor(() => expect(stockRow()).toHaveFocus())

  await user.click(stockRow())
  expect(countField()).toHaveValue('')
  // Dismissing a typed count discards it: the next open is empty too.
  await user.type(countField(), '9')
  await user.click(within(onDrawer()).getByRole('button', { name: 'Cancel' }))
  await noDrawer()
  await user.click(stockRow())
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
  await user.click(stockRow())
  await user.type(countField(), '30')
  await user.click(within(onDrawer()).getByRole('button', { name: 'Start tracking' }))
  // A failed start keeps the drawer, its typed count and the might-not-have-saved alert.
  expect(await within(onDrawer()).findByText('That might not have saved.')).toBeVisible()
  expect(countField()).toHaveValue('30')
  expect(stockRow()).toHaveAccessibleDescription('Not tracking')

  mode = 'hold'
  await user.click(within(onDrawer()).getByRole('button', { name: 'Try saving count again' }))
  expect(await within(onDrawer()).findByRole('button', { name: 'Saving count...' })).toBeDisabled()
  expect(countField()).toBeDisabled()
  expect(within(onDrawer()).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  // Nothing optimistic: the row still reads stock off behind the drawer.
  expect(stockRow()).toHaveAccessibleDescription('Not tracking')
  release()
  await waitFor(() => expect(stockRow()).toHaveAccessibleDescription('30 tablets left'))

  // A failed stop keeps the confirm open with its alert and retry label.
  mode = 'fail'
  await noDrawer()
  await user.click(stockRow())
  await user.click(within(optionsDrawer()).getByRole('button', { name: 'Stop tracking' }))
  await user.click(within(stopConfirm()).getByRole('button', { name: 'Stop tracking' }))
  expect(await within(stopConfirm()).findByText('That might not have saved.')).toBeVisible()
  expect(within(stopConfirm()).getByRole('button', { name: 'Retry stop' })).toBeEnabled()
  expect(stockRow()).toHaveAccessibleDescription('30 tablets left')
  unmount()
  client.clear()
})

const stock = () => screen.getByRole('region', { name: 'Stock', hidden: true })

const pastCount: MedicineRecord = {
  ...tablets,
  stock: { tracked: true, count: 0, intakePastCount: true },
}

async function changeCount(user: ReturnType<typeof userEvent.setup>, medicine = tablets) {
  await user.click(stockRow())
  const options = within(optionsDrawer(medicine.label))
  const change = options.getByRole('button', { name: 'Change the count' })
  expect(options.getAllByRole('button').slice(-2)).toEqual([
    change,
    options.getByRole('button', { name: 'Stop tracking' }),
  ])
  await user.click(change)
  const drawer = within(screen.getByRole('dialog', { name: `Change ${medicine.label} count` }))
  const field = drawer.getByRole('textbox', { name: 'Current count' })
  expect(field).toHaveValue('')
  return { drawer, field }
}

test('correcting a count to zero clears the past-count line after a fresh read and restores focus', async () => {
  const { client, user, unmount } = open(pastCount)
  let current = pastCount
  const requests = vi.fn()
  const reads = vi.fn()
  server.use(
    http.get('/api/medicines', () => {
      reads(current.revision)
      return HttpResponse.json({ medicines: [current] })
    }),
    http.patch('/api/medicines', async ({ request }) => {
      const body = (await request.json()) as StockRequest
      requests(body)
      current = receipt(current, body)
      return HttpResponse.json({ medicines: [current] })
    }),
  )
  expect(stockRow()).toHaveAccessibleDescription(
    'More was taken than counted. Change the count to fix it. 0 tablets left',
  )
  const { drawer, field } = await changeCount(user)
  await user.type(field, '0')
  await user.click(drawer.getByRole('button', { name: 'Save count' }))
  await noDrawer()
  await waitFor(() => expect(reads).toHaveBeenCalledWith(2))
  expect(stockRow()).toHaveAccessibleDescription('0 tablets left')
  await waitFor(() => expect(stockRow()).toHaveFocus())
  expect(requests).toHaveBeenCalledWith({
    operation: 'stockCorrection',
    stock: {
      actionId: expect.any(String),
      medicineId: tablets.id,
      expectedRevision: 1,
      unit: 'tablet',
      count: 0,
    },
  })
  unmount()
  client.clear()
})

test('invalid correction counts stay in the drawer and never send a request', async () => {
  const tracked: MedicineRecord = { ...capsules, stock: { tracked: true, count: 24 } }
  const requests = confirmingServer(tracked)
  const { user, client, unmount } = open(tracked)
  const { drawer, field } = await changeCount(user, tracked)
  const submit = drawer.getByRole('button', { name: 'Save count' })
  for (const [value, error] of [
    ['', 'Enter a count.'],
    ['-1', 'Enter a number, like 30.'],
    ['7.5', 'Use whole capsules.'],
  ]) {
    await user.clear(field)
    if (value) await user.type(field, value)
    await user.click(submit)
    expect(await drawer.findByText(error)).toBeVisible()
    expect(field).toBeInvalid()
  }
  expect(requests).toEqual([])
  unmount()
  client.clear()
})

test.each([
  [400, 'Count wasn’t saved.'],
  [500, 'That might not have saved.'],
])(
  'a failed correction (%s) preserves the confirmed count and retries the same attempt',
  async (status, message) => {
    const requests: StockRequest[] = []
    server.use(
      http.patch('/api/medicines', async ({ request }) => {
        const body = (await request.json()) as StockRequest
        requests.push(body)
        if (requests.length === 1) return HttpResponse.json({}, { status })
        return HttpResponse.json({ medicines: [receipt(pastCount, body)] })
      }),
    )
    const { user, client, unmount } = open(pastCount)
    const { drawer, field } = await changeCount(user)
    await user.type(field, '10')
    await user.click(drawer.getByRole('button', { name: 'Save count' }))
    expect(await drawer.findByText(message)).toBeVisible()
    expect(field).toHaveValue('10')
    expect(stockRow()).toHaveTextContent('0 tablets left')
    await user.click(drawer.getByRole('button', { name: 'Try saving count again' }))
    await waitFor(() => expect(stockRow()).toHaveAccessibleDescription('10 tablets left'))
    expect(requests).toEqual([requests[0], requests[0]])
    unmount()
    client.clear()
  },
)

test('the Medications list clears the past-count line from the confirmed correction cache', async () => {
  confirmingServer(pastCount)
  const { user, client, unmount, rerender } = open(pastCount, false)
  expect(screen.getByText('More was taken than counted')).toBeVisible()
  const navigate = (href: string) => {
    window.history.replaceState(null, '', href)
    rerender(
      <QueryClientProvider client={client}>
        <MedicationsScreen initialNow={now} serverEntry />
      </QueryClientProvider>,
    )
  }
  navigate(`/medications?medicine=${tablets.id}`)
  const { drawer, field } = await changeCount(user)
  await user.type(field, '10')
  await user.click(drawer.getByRole('button', { name: 'Save count' }))
  await noDrawer()
  navigate('/medications')
  expect(screen.getByText('10 tablets left')).toBeVisible()
  expect(screen.queryByText('More was taken than counted')).toBeNull()
  unmount()
  client.clear()
})

test('Archived medication detail shows the count read-only with no stock actions', async () => {
  const archived: MedicineRecord = {
    ...tablets,
    archivedAt: now,
    stock: { tracked: true, count: 12.5 },
  }
  // 238·A3: a read-only Stock row in the Archived inset group, never a stock action.
  const { client, unmount } = open(archived)
  expect(await screen.findByText('Archived')).toBeVisible()
  const stockRow = () => within(screen.getByRole('list')).getAllByRole('listitem')[0]
  expect(stockRow()).toHaveTextContent('Stock12½ tablets left')
  expect(within(stockRow()).queryByRole('button')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Stop tracking' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Stock' })).toBeNull()
  unmount()
  client.clear()

  // Stock off on an Archived medicine reads Not tracking, still with no action.
  const untracked = open({ ...archived, stock: { tracked: false } })
  expect(await screen.findByText('Archived')).toBeVisible()
  expect(stockRow()).toHaveTextContent('StockNot tracking')
  expect(screen.queryByRole('button', { name: /stock|track/i })).toBeNull()
  untracked.unmount()
  untracked.client.clear()
})
