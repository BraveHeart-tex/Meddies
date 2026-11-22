import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { MedicineRecordScreen } from '../src/features/medicines/medicine-record-screen'
import { medicineKeys, useMedicines } from '../src/features/medicines/queries'
import { MedicinePanel } from '../src/features/medicines/medicine-panel'
import { Toaster } from '../src/components/ui/toast'
import { scheduleKeys, type ScheduleSnapshot } from '../src/features/schedules/queries'
import { MedicineRecordForm } from '../src/features/medicines/medicine-record-form'
import type { MedicineRecord } from '../src/features/medicines/contract'
import { writeSessionDraft } from '../src/lib/session-drafts'
import { medicineRecordKey } from '../src/features/medicines/use-medicine-record-save'
import { createQueryClient } from '../src/lib/session-query-client'
import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import { server } from './helpers/msw-server'
import { findConfirmation } from './helpers/toasts'

export const medicine: MedicineRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Magnesium',
  strength: '400 mg',
  unit: 'tablet',
  stock: { tracked: false },
  revision: 1,
  lastActionId: null,
  currentStrengthRevisionId: '22222222-2222-4222-8222-222222222222',
  everHadSchedule: true,
  everHadDose: true,
  latestTakenAt: '2026-11-15T05:05:00.000Z',
  archivedAt: null,
  strengthRevisions: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      strength: '200 mg',
      label: 'Magnesium',
      unit: 'tablet',
      effectiveAt: '2026-11-01T00:00:00.000Z',
      previousValues: [],
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      strength: '400 mg',
      label: 'Magnesium',
      unit: 'tablet',
      effectiveAt: '2026-11-09T06:00:00.000Z',
      previousValues: [],
    },
  ],
}
function open(
  mode: 'fix' | 'strength' = 'fix',
  record = medicine,
  periodId = record.currentStrengthRevisionId,
  draft?: Record<string, unknown>,
) {
  const client = createQueryClient()
  if (draft)
    writeSessionDraft(client, medicineRecordKey(record.id, mode, periodId), {
      label: record.label,
      strength: '600 mg',
      unit: record.unit,
      date: '',
      time: '',
      expectedRevision: record.revision,
      ...draft,
    })
  const onSaved = vi.fn()
  const onCancel = vi.fn()
  const view = render(
    <QueryClientProvider client={client}>
      <SchedulingClockProvider serverNow="2026-11-15T07:00:00.000Z">
        <MedicineRecordForm
          medicine={record}
          mode={mode}
          periodId={periodId}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      </SchedulingClockProvider>
    </QueryClientProvider>,
  )
  return { ...view, client, onSaved, onCancel, user: userEvent.setup() }
}
test('selected-period correction allows used Type and retains its unchanged-Type save', async () => {
  let payload: Record<string, unknown> = {}
  server.use(
    http.patch('/api/medicines', async ({ request }) => {
      const body = (await request.json()) as { correction: Record<string, unknown> }
      payload = body.correction
      return HttpResponse.json({
        medicines: [
          {
            ...medicine,
            revision: 2,
            lastActionId: payload.actionId,
            strengthRevisions: medicine.strengthRevisions.map((r, i) =>
              i === 0 ? { ...r, strength: '250 mg' } : r,
            ),
          },
        ],
      })
    }),
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
  )
  const { user, onSaved } = open('fix', medicine, medicine.strengthRevisions[0].id)
  expect(screen.getByRole('textbox', { name: /Strength/ })).toHaveValue('200 mg')
  expect(screen.getByRole('combobox', { name: 'Type' })).toBeVisible()
  expect(screen.getByText('tablet', { exact: true })).toBeVisible()
  expect(
    screen.getByText(/Name and strength change only for this period and its doses\./),
  ).toBeVisible()
  expect(
    screen.getByText(
      'Type and dose unit change throughout this medication, including every strength period, dose and saved schedule.',
    ),
  ).toBeVisible()
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name: 'Liquid' }))
  expect(screen.getByText('ml', { exact: true })).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Strength' })).toHaveValue('200 mg')
  expect(screen.getByRole('textbox', { name: 'Strength' })).toHaveAccessibleDescription(
    'On the bottle, e.g. 250 mg/5 ml. Not your dose amount.',
  )
  expect(screen.getByRole('button', { name: 'Review Type change' })).toBeVisible()
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name: 'Tablet' }))
  await user.clear(screen.getByRole('textbox', { name: /Strength/ }))
  await user.type(screen.getByRole('textbox', { name: /Strength/ }), '250 mg')
  await user.click(screen.getByRole('button', { name: 'Save details' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  expect(payload).toMatchObject({
    strengthRevisionId: medicine.strengthRevisions[0].id,
    strength: '250 mg',
    expectedRevision: 1,
    unit: 'tablet',
  })
})
test('strength change starts with explicit blank date/time and focuses its first missing control', async () => {
  const { user } = open('strength')
  expect(screen.getByRole('button', { name: /^Started on/ })).toHaveTextContent('Choose')
  await user.type(screen.getByRole('textbox', { name: 'New strength' }), '600 mg')
  await user.click(screen.getByRole('button', { name: 'Save strength change' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Started on/ })).toHaveFocus())
  expect(screen.getByText('Choose a date.')).toBeVisible()
})

test('unknown receipt retries the same action and rejected saves retain details', async () => {
  const actions: unknown[] = []
  server.use(
    http.patch('/api/medicines', async ({ request }) => {
      const body = (await request.json()) as { correction: Record<string, unknown> }
      actions.push(body.correction.actionId)
      return actions.length === 1
        ? HttpResponse.error()
        : HttpResponse.json({ error: 'validation' }, { status: 400 })
    }),
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
  )
  const { user } = open()
  const input = screen.getByRole('textbox', { name: 'Name' })
  await user.clear(input)
  await user.type(input, 'Fixed name')
  await user.click(screen.getByRole('button', { name: 'Save details' }))
  await user.click(await screen.findByRole('button', { name: 'Retry save' }))
  await screen.findByText('Your change wasn’t saved')
  expect(actions).toHaveLength(2)
  expect(actions[0]).toBe(actions[1])
  expect(input).toHaveValue('Fixed name')
})

test('offline never auto-saves on reconnect; dirty Cancel requires explicit discard', async () => {
  const { user, onCancel } = open()
  await user.type(screen.getByRole('textbox', { name: 'Name' }), ' fixed')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  fireEvent(window, new Event('offline'))
  expect(await screen.findByRole('button', { name: 'Connect to save' })).toBeDisabled()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  fireEvent(window, new Event('online'))
  expect(await screen.findByRole('button', { name: 'Save details' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await user.click(await screen.findByRole('button', { name: 'Keep editing' }))
  expect(onCancel).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await user.click(await screen.findByRole('button', { name: 'Discard changes' }))
  expect(onCancel).toHaveBeenCalledOnce()
})

test('scheduled Taken disclosure follows chosen time and keeps a saved equality snapshot', async () => {
  const client = createQueryClient()
  const { TakenForm } = await import('../src/features/schedules/taken-form')
  const record = {
    ...medicine,
    strengthRevisions: medicine.strengthRevisions.map((r, i) =>
      i === 1 ? { ...r, effectiveAt: '2026-11-15T06:00:00.000Z' } : r,
    ),
  }
  render(
    <QueryClientProvider client={client}>
      <SchedulingClockProvider serverNow="2026-11-15T07:00:00.000Z">
        <TakenForm
          medicine={record}
          dose={{
            id: 'dose',
            scheduleId: medicine.id,
            medicineId: medicine.id,
            dueAt: '2026-11-15T05:00:00.000Z',
            quantity: 1,
            status: 'Due now',
          }}
          open
          saving={false}
          problem={null}
          onOpen={vi.fn()}
          onSubmit={vi.fn()}
        />
      </SchedulingClockProvider>
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  expect(screen.getByRole('status')).toHaveTextContent(
    'This dose will use 400 mg, based on the time taken.',
  )
  await user.click(screen.getByRole('button', { name: 'At 08:00' }))
  expect(screen.getByRole('status')).toHaveTextContent(
    'This dose will use 200 mg, based on the time taken.',
  )
  expect(screen.getByText(/Same as scheduled/)).toBeVisible()
})

test('Unscheduled disclosure updates from an earlier period to Now before saving', async () => {
  const client = createQueryClient()
  const { UnscheduledDoseForm } =
    await import('../src/features/unscheduled-doses/unscheduled-dose-form')
  const record = {
    ...medicine,
    strengthRevisions: medicine.strengthRevisions.map((r, i) =>
      i === 1 ? { ...r, effectiveAt: '2026-11-15T06:00:00.000Z' } : r,
    ),
  }
  const onSubmit = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <SchedulingClockProvider serverNow="2026-11-15T07:00:00.000Z">
        <UnscheduledDoseForm
          medicine={record}
          defaults={{ when: 'other', date: '2026-11-14', time: '08:00', quantity: '1' }}
          saving={false}
          problem={null}
          conflict={false}
          labels={{ save: 'Save changes', retry: 'Retry save' }}
          draftKey={null}
          onCancel={vi.fn()}
          onSubmit={onSubmit}
        />
      </SchedulingClockProvider>
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  expect(screen.getByRole('status')).toHaveTextContent(
    'This dose will use 200 mg, based on the time taken.',
  )
  await user.click(screen.getByRole('button', { name: /Now/ }))
  expect(screen.getByRole('status')).toHaveTextContent(
    'This dose will use 400 mg, based on the time taken.',
  )
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ takenAt: '2026-11-15T07:00:00.000Z' }),
      expect.anything(),
    ),
  )
})

test('strength bounds reject future and before latest Taken without sending a save', async () => {
  let writes = 0
  server.use(
    http.patch('/api/medicines', () => {
      writes++
      return HttpResponse.error()
    }),
  )
  const before = open('strength', medicine, medicine.currentStrengthRevisionId, {
    date: '2026-11-15',
    time: '08:00',
  })
  await before.user.click(screen.getByRole('button', { name: 'Save strength change' }))
  expect(
    await screen.findByText('Choose a time no earlier than the latest dose recorded as Taken.'),
  ).toBeVisible()
  expect(screen.getByRole('combobox', { name: 'Started at hour' })).toHaveFocus()
  before.unmount()
  const future = open('strength', medicine, medicine.currentStrengthRevisionId, {
    date: '2026-11-15',
    time: '10:01',
  })
  await future.user.click(screen.getByRole('button', { name: 'Save strength change' }))
  expect(await screen.findByText('Choose a time no later than now.')).toBeVisible()
  expect(writes).toBe(0)
})

test('server conflict retains values and explicitly reloads current bounds before another edit', async () => {
  let reads = 0
  server.use(
    http.patch('/api/medicines', () => HttpResponse.json({ error: 'conflict' }, { status: 409 })),
    http.get('/api/medicines', () => {
      reads++
      return HttpResponse.json({
        medicines: [{ ...medicine, latestTakenAt: '2026-11-15T06:30:00.000Z' }],
      })
    }),
  )
  const { user, onCancel } = open('strength', medicine, medicine.currentStrengthRevisionId, {
    date: '2026-11-15',
    time: '09:00',
  })
  await user.click(screen.getByRole('button', { name: 'Save strength change' }))
  const review = await screen.findByRole('button', { name: 'Review saved medication' })
  expect(screen.getByRole('textbox', { name: 'New strength' })).toHaveValue('600 mg')
  expect(reads).toBe(0)
  await user.click(review)
  await waitFor(() => expect(onCancel).toHaveBeenCalledOnce())
  expect(reads).toBe(1)
})

test('pending correction disables controls and survives form unmount with its draft', async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let action: unknown
  server.use(
    http.patch('/api/medicines', async ({ request }) => {
      const body = (await request.json()) as { correction: Record<string, unknown> }
      action = body.correction.actionId
      await held
      return HttpResponse.json({
        medicines: [
          {
            ...medicine,
            label: 'Fixed name',
            revision: 2,
            lastActionId: action,
            strengthRevisions: medicine.strengthRevisions.map((r) =>
              r.id === medicine.currentStrengthRevisionId ? { ...r, label: 'Fixed name' } : r,
            ),
          },
        ],
      })
    }),
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
  )
  const first = open()
  const snapshot: ScheduleSnapshot = {
    date: '2026-11-15',
    now: '2026-11-15T07:00:00.000Z',
    schedules: [],
    records: [
      {
        scheduleId: medicine.id,
        dueAt: '2026-11-15T05:00:00.000Z',
        takenAt: '2026-11-15T05:00:00.000Z',
        quantity: 1,
        outcome: 'Taken',
        revision: 0,
        strengthRevisionId: medicine.currentStrengthRevisionId,
        strength: '400 mg',
        medicineLabel: 'Magnesium',
        unit: 'tablet',
      },
    ],
  }
  first.client.setQueryData(scheduleKeys.snapshot(), snapshot)

  await first.user.clear(screen.getByRole('textbox', { name: 'Name' }))
  await first.user.type(screen.getByRole('textbox', { name: 'Name' }), 'Fixed name')
  await first.user.click(screen.getByRole('button', { name: 'Save details' }))
  expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled()
  expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled()
  expect(
    first.client.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())?.records[0].medicineLabel,
  ).toBe('Magnesium')
  first.unmount()
  render(
    <QueryClientProvider client={first.client}>
      <SchedulingClockProvider serverNow="2026-11-15T07:00:00.000Z">
        <MedicineRecordForm
          medicine={medicine}
          mode="fix"
          periodId={medicine.currentStrengthRevisionId}
          onSaved={first.onSaved}
          onCancel={first.onCancel}
        />
      </SchedulingClockProvider>
    </QueryClientProvider>,
  )
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Fixed name')
  expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  release()
  await waitFor(() => expect(first.onSaved).toHaveBeenCalledOnce())
  expect(
    first.client.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())?.records[0],
  ).toMatchObject({ medicineLabel: 'Fixed name', strength: '400 mg', revision: 0 })
})

test('strength receipt confirms the new period and exact explicit effective instant', async () => {
  server.use(
    http.patch('/api/medicines', async ({ request }) => {
      const body = (await request.json()) as {
        change: {
          actionId: string
          effectiveAt: string
          expectedRevision: number
          strength: string
        }
      }
      expect(body.change).toMatchObject({
        effectiveAt: '2026-11-15T06:00:00.000Z',
        expectedRevision: 1,
        strength: '600 mg',
      })
      return HttpResponse.json({
        medicines: [
          {
            ...medicine,
            revision: 2,
            strength: '600 mg',
            lastActionId: body.change.actionId,
            currentStrengthRevisionId: body.change.actionId,
            strengthRevisions: [
              ...medicine.strengthRevisions,
              {
                id: body.change.actionId,
                strength: '600 mg',
                label: medicine.label,
                unit: medicine.unit,
                effectiveAt: body.change.effectiveAt,
                previousValues: [],
              },
            ],
          },
        ],
      })
    }),
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
  )
  const { user, onSaved } = open('strength', medicine, medicine.currentStrengthRevisionId, {
    date: '2026-11-15',
    time: '09:00',
  })
  await user.click(screen.getByRole('button', { name: 'Save strength change' }))
  await waitFor(() =>
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 2, strength: '600 mg' }),
    ),
  )
})

test('a scheduled correction retaining its Taken minute keeps the saved strength at equality', async () => {
  const { TakenForm } = await import('../src/features/schedules/taken-form')
  const client = createQueryClient()
  const record = {
    ...medicine,
    strengthRevisions: medicine.strengthRevisions.map((r, i) =>
      i === 1 ? { ...r, effectiveAt: '2026-11-15T06:00:00.000Z' } : r,
    ),
  }
  const taken = {
    id: 'dose',
    scheduleId: medicine.id,
    dueAt: '2026-11-15T05:00:00.000Z',
    medicineId: medicine.id,
    quantity: 1,
    status: 'Taken' as const,
    record: {
      scheduleId: medicine.id,
      dueAt: '2026-11-15T05:00:00.000Z',
      takenAt: '2026-11-15T06:00:00.000Z',
      quantity: 1,
      outcome: 'Taken' as const,
      strength: '200 mg',
      strengthRevisionId: medicine.strengthRevisions[0].id,
      medicineLabel: medicine.label,
      unit: medicine.unit,
    },
  }
  render(
    <QueryClientProvider client={client}>
      <SchedulingClockProvider serverNow="2026-11-15T07:00:00.000Z">
        <TakenForm
          medicine={record}
          dose={taken}
          mode="edit"
          open
          saving={false}
          problem={null}
          onOpen={vi.fn()}
          onSubmit={vi.fn()}
        />
      </SchedulingClockProvider>
    </QueryClientProvider>,
  )
  expect(screen.getByRole('status')).toHaveTextContent(
    'This dose will use 200 mg, based on the time taken.',
  )
  await userEvent.setup().click(screen.getByRole('button', { name: /Now/ }))
  expect(screen.getByRole('status')).toHaveTextContent(
    'This dose will use 400 mg, based on the time taken.',
  )
})

function ReadScreen() {
  const read = useMedicines()
  return (
    <MedicineRecordScreen
      medicinesRead={read}
      medicineId={medicine.id}
      record="history"
      today="2026-11-15"
      onSaved={vi.fn()}
    />
  )
}
test('record read keeps its shell through loading and error, retries, and identifies correction periods', async () => {
  let succeeds = false
  server.use(
    http.get('/api/medicines', () =>
      succeeds
        ? HttpResponse.json({
            medicines: [
              {
                ...medicine,
                strengthRevisions: medicine.strengthRevisions.map((period, index) =>
                  index === 0 ? { ...period, effectiveAt: '0001-01-01T00:00:00.000Z' } : period,
                ),
              },
            ],
          })
        : HttpResponse.json({ error: 'unavailable' }, { status: 503 }),
    ),
  )
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ReadScreen />
    </QueryClientProvider>,
  )
  expect(screen.getByText('Loading medication')).toBeInTheDocument()
  const retry = await screen.findByRole('button', { name: 'Try again' })
  expect(screen.getByRole('link', { name: 'Medication' })).toBeVisible()
  succeeds = true
  await userEvent.setup().click(retry)
  // 346·C2: the note sits above the periods, only the current period has the Current badge,
  // and each period links to its own Detail correction.
  const current = (await screen.findByText('400 mg')).closest('[data-slot="item"]') as HTMLElement
  const earlier = screen.getByText('200 mg').closest('[data-slot="item"]') as HTMLElement
  expect(within(current).getByText('Current')).toBeVisible()
  expect(within(earlier).queryByText('Current')).not.toBeInTheDocument()
  expect(screen.getAllByText('Current')).toHaveLength(1)
  expect(screen.queryByText(/Earlier strength/)).not.toBeInTheDocument()
  expect(screen.queryByText(/1901/)).not.toBeInTheDocument()
  expect(screen.getByText(/First strength period/)).toBeVisible()
  const note = screen.getByText(
    'Editing a period updates the doses logged in it. Changing strength starts a new period.',
  )
  expect(note.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.queryByText(/Fixing a mistake/)).not.toBeInTheDocument()
  expect(
    within(current).getByRole('link', { name: 'Edit details for this period' }),
  ).toHaveAttribute('href', expect.stringContaining(`period=${medicine.strengthRevisions[1].id}`))
  expect(
    within(earlier).getByRole('link', { name: 'Edit details for this period' }),
  ).toHaveAttribute('href', expect.stringContaining(`period=${medicine.strengthRevisions[0].id}`))
})

function EditReadScreen() {
  const read = useMedicines()
  const record = read.medicines[0] as MedicineRecord
  return record ? (
    <MedicineRecordForm
      medicine={record}
      mode="strength"
      periodId={record.currentStrengthRevisionId}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
    />
  ) : null
}
test('a newly changed Taken bound reloads after rejection without resetting the strength draft', async () => {
  const client = createQueryClient()
  const { medicineKeys } = await import('../src/features/medicines/queries')
  client.setQueryData(medicineKeys.list(), [medicine])
  writeSessionDraft(
    client,
    medicineRecordKey(medicine.id, 'strength', medicine.currentStrengthRevisionId),
    {
      label: medicine.label,
      strength: '600 mg',
      unit: medicine.unit,
      date: '2026-11-15',
      time: '09:00',
      expectedRevision: 1,
    },
  )
  server.use(
    http.patch('/api/medicines', () => HttpResponse.json({ error: 'validation' }, { status: 400 })),
    http.get('/api/medicines', () =>
      HttpResponse.json({
        medicines: [{ ...medicine, latestTakenAt: '2026-11-15T06:30:00.000Z' }],
      }),
    ),
  )
  render(
    <QueryClientProvider client={client}>
      <SchedulingClockProvider serverNow="2026-11-15T07:00:00.000Z">
        <EditReadScreen />
      </SchedulingClockProvider>
    </QueryClientProvider>,
  )
  await userEvent.setup().click(screen.getByRole('button', { name: 'Save strength change' }))
  expect(
    await screen.findByText('Choose a time no earlier than the latest dose recorded as Taken.'),
  ).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'New strength' })).toHaveValue('600 mg')
  expect(screen.getByRole('combobox', { name: 'Started at hour' })).toHaveFocus()
  expect(screen.getByText(/latest dose recorded as Taken:/)).toHaveTextContent('09:30')
})

test('a restored correction sends the revision first edited rather than silently rebasing', async () => {
  let expectedRevision: unknown
  server.use(
    http.patch('/api/medicines', async ({ request }) => {
      const body = (await request.json()) as { correction: { expectedRevision: number } }
      expectedRevision = body.correction.expectedRevision
      return HttpResponse.json({ error: 'conflict' }, { status: 409 })
    }),
  )
  const { user } = open('fix', medicine, medicine.currentStrengthRevisionId, {
    label: 'Old draft',
    strength: '400 mg',
    expectedRevision: 0,
  })
  await user.click(screen.getByRole('button', { name: 'Save details' }))
  await screen.findByRole('button', { name: 'Review saved medication' })
  expect(expectedRevision).toBe(0)
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Old draft')
})

// #377: a confirmed record save returns to Medication detail with its Toast. Catches the
// confirmation going back inline or dropping its check.
test.each([
  ['fix', 'Save details', 'Fixed details saved'],
  ['strength', 'Save strength change', 'Strength change saved'],
] as const)('a confirmed %s save shows its Toast', async (mode, saveLabel, title) => {
  const now = '2026-11-15T07:00:00.000Z'
  server.use(
    http.patch('/api/medicines', async ({ request }) => {
      const body = (await request.json()) as {
        correction?: { actionId: string; strength: string }
        change?: { actionId: string; effectiveAt: string; strength: string }
      }
      const { change, correction } = body
      const actionId = (change ?? correction)!.actionId
      return HttpResponse.json({
        medicines: [
          {
            ...medicine,
            revision: 2,
            lastActionId: actionId,
            ...(correction && {
              strength: correction.strength,
              strengthRevisions: medicine.strengthRevisions.map((r, i) =>
                i === 1 ? { ...r, strength: correction.strength } : r,
              ),
            }),
            ...(change && {
              strength: change.strength,
              currentStrengthRevisionId: actionId,
              strengthRevisions: [
                ...medicine.strengthRevisions,
                {
                  id: actionId,
                  strength: change.strength,
                  label: medicine.label,
                  unit: medicine.unit,
                  effectiveAt: change.effectiveAt,
                  previousValues: [],
                },
              ],
            }),
          },
        ],
      })
    }),
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
    http.get('/api/schedules', () =>
      HttpResponse.json({ schedules: [], records: [], date: '2026-11-15', now }),
    ),
  )
  const periodId = medicine.currentStrengthRevisionId
  const client = createQueryClient()
  client.setQueryData(medicineKeys.list(), [medicine])
  client.setQueryData<ScheduleSnapshot>(scheduleKeys.snapshot(), {
    schedules: [],
    records: [],
    now,
    date: '2026-11-15',
  })
  if (mode === 'strength')
    writeSessionDraft(client, medicineRecordKey(medicine.id, mode, periodId), {
      label: medicine.label,
      strength: '600 mg',
      unit: medicine.unit,
      date: '2026-11-15',
      time: '09:00',
      expectedRevision: medicine.revision,
    })
  render(
    <QueryClientProvider client={client}>
      <Toaster>
        <MedicinePanel
          scheduleMode="detail"
          detailMedicineId={medicine.id}
          record={mode}
          periodId={periodId}
          initialNow={now}
          serverEntry
        />
      </Toaster>
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  if (mode === 'fix') {
    await user.clear(await screen.findByRole('textbox', { name: /Strength/ }))
    await user.type(screen.getByRole('textbox', { name: /Strength/ }), '450 mg')
  }
  await user.click(await screen.findByRole('button', { name: saveLabel }))
  await findConfirmation(title, 'check')
})

// #442: public form + authenticated read boundary. No Type correction write is permitted.
test('Type review counts conflicts and compatible amounts and reaches final review directly with Stock off', async () => {
  const requests: { method: string; body: unknown }[] = []
  let stockTracked = true
  let conflicts = [
    { key: 'dose:1', kind: 'scheduled', quantity: 0.5, time: '2026-11-01T06:00:00.000Z' },
    {
      key: 'schedule:1',
      kind: 'schedule',
      quantity: 0.5,
      time: '09:00',
      version: {
        id: '44444444-4444-4444-8444-444444444444',
        startDate: '2026-11-01',
        confirmedAt: '2026-11-01T00:00:00.000Z',
        replacedAt: null,
      },
    },
  ]
  server.use(
    http.all('/api/medicines/type-correction', async ({ request }) => {
      requests.push({ method: request.method, body: await request.json() })
      return HttpResponse.json({
        review: {
          medicineId: medicine.id,
          unit: 'capsule',
          fromUnit: 'tablet',
          revision: 1,
          reviewVersion: 5,
          stockTracked,
          compatibleAmounts: 7,
          conflicts,
        },
      })
    }),
  )
  const { user, onSaved } = open('fix', medicine, medicine.strengthRevisions[0].id)
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name: 'Capsule' }))
  await user.click(screen.getByRole('button', { name: 'Review Type change' }))
  expect(await screen.findByRole('heading', { name: 'Change to Capsule?' })).toHaveFocus()
  expect(screen.getByText('Every strength period, dose and schedule.')).toBeVisible()
  expect(screen.getByText('1 tablet is recorded as 1 capsule.')).toBeVisible()
  expect(screen.getByRole('heading', { name: '2 amounts to check' })).toBeVisible()
  expect(screen.getByText(/1 dose and 1 schedule amount/)).toBeVisible()
  expect(screen.getByText('7 compatible amounts keep their number.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Check first amount' })).toBeVisible()
  for (const tracked of [true, false]) {
    await user.click(screen.getByRole('button', { name: 'Edit details' }))
    conflicts = []
    stockTracked = tracked
    await user.click(screen.getByRole('button', { name: 'Review Type change' }))
    expect(await screen.findByRole('heading', { name: 'All saved amounts fit' })).toBeVisible()
    expect(
      screen.getByText(tracked ? 'Next, count your capsules.' : 'Stock tracking stays off.'),
    ).toBeVisible()
    if (!tracked) {
      await user.click(screen.getByRole('button', { name: 'Review changes' }))
      expect(screen.getByRole('heading', { name: 'Review your changes' })).toHaveFocus()
      expect(screen.getByText('Same numbers, now in capsules')).toBeVisible()
      expect(screen.getByText('Stays off')).toBeVisible()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    }
  }
  expect(requests).toEqual(
    Array(3).fill({ method: 'POST', body: { medicineId: medicine.id, unit: 'capsule' } }),
  )
  expect(onSaved).not.toHaveBeenCalled()
})

test('compatible tracked Type correction requires a fresh count and accepts zero', async () => {
  const tracked = { ...medicine, stock: { tracked: true as const, count: 18, threshold: 5 } }
  server.use(
    http.post('/api/medicines/type-correction', () =>
      HttpResponse.json({
        review: {
          medicineId: medicine.id,
          fromUnit: 'tablet',
          unit: 'capsule',
          revision: 1,
          reviewVersion: 5,
          stockTracked: true,
          compatibleAmounts: 7,
          conflicts: [],
        },
      }),
    ),
  )
  const { user, onSaved } = open('fix', tracked)
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name: 'Capsule' }))
  await user.click(screen.getByRole('button', { name: 'Review Type change' }))
  await user.click(await screen.findByRole('button', { name: 'Continue to Stock' }))
  expect(screen.getByRole('heading', { name: 'How many capsules do you have?' })).toHaveFocus()
  expect(screen.getByText(/saved count of 18 tablets/)).toBeVisible()
  expect(screen.getByRole('note')).toHaveTextContent('Your Low-stock alert will turn off')
  const count = screen.getByRole('textbox', { name: 'Current count' })
  const next = screen.getByRole('button', { name: 'Review changes' })
  expect(count).toHaveValue('')
  await user.click(next)
  expect(count).toHaveFocus()
  expect(screen.getByText('Enter your current count.')).toBeVisible()
  await user.type(count, '1.5')
  await user.click(next)
  expect(count).toHaveFocus()
  expect(screen.getByText('Use whole capsules.')).toBeVisible()
  await user.clear(count)
  await user.type(count, '0')
  await user.click(next)
  expect(screen.getByRole('heading', { name: 'Review your changes' })).toHaveFocus()
  expect(screen.getByText('0 capsules')).toBeVisible()
  expect(screen.getByText('Below 5 tablets → Off')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByRole('textbox', { name: 'Current count' })).toHaveValue('0')
  expect(onSaved).not.toHaveBeenCalled()
})

test('failed Type preflight retains selected-period details, retries only the read and permits cancellation', async () => {
  const methods: string[] = []
  server.use(
    http.all('/api/medicines/type-correction', async ({ request }) => {
      methods.push(request.method)
      expect(await request.json()).toEqual({ medicineId: medicine.id, unit: 'capsule' })
      return methods.length === 1
        ? HttpResponse.error()
        : HttpResponse.json({
            review: {
              medicineId: medicine.id,
              unit: 'capsule',
              fromUnit: 'tablet',
              revision: 1,
              reviewVersion: 2,
              stockTracked: false,
              compatibleAmounts: 1,
              conflicts: [],
            },
          })
    }),
  )
  const period = medicine.strengthRevisions[0].id
  const { user, client, onSaved, onCancel } = open('fix', medicine, period)
  await user.clear(screen.getByRole('textbox', { name: 'Name' }))
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name: 'Capsule' }))
  await user.click(screen.getByRole('button', { name: 'Review Type change' }))
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Corrected Magnesium')
  await user.clear(screen.getByRole('textbox', { name: 'Strength' }))
  await user.type(screen.getByRole('textbox', { name: 'Strength' }), '250 mg')
  await user.click(screen.getByRole('button', { name: 'Review Type change' }))
  expect(await screen.findByText('Couldn’t load the review.')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Review Type change' })).toHaveFocus()
  expect(methods).toEqual(['POST'])
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('dialog', { name: 'Discard these changes?' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Keep editing' }))
  await user.click(screen.getByRole('button', { name: 'Try loading again' }))
  expect(await screen.findByRole('heading', { name: 'Change to Capsule?' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Edit details' }))
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Corrected Magnesium')
  expect(screen.getByRole('textbox', { name: 'Strength' })).toHaveValue('250 mg')
  expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Capsule')
  expect(screen.getByText(/This period ran from/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await user.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(onCancel).toHaveBeenCalledOnce()
  expect(onSaved).not.toHaveBeenCalled()
  expect(methods).toEqual(['POST', 'POST'])
  expect(client.getQueryData(medicineKeys.list())).toBeUndefined()
})

// #450: the complete production form proves queue identity, explicit entry and focus.
const repairConflicts = [
  { key: 'dose:scheduled', kind: 'scheduled', quantity: 0.5, time: '2026-11-01T06:10:00.000Z' },
  { key: 'dose:unscheduled', kind: 'unscheduled', quantity: 1.5, time: '2026-11-02T18:15:00.000Z' },
  {
    key: 'schedule:current',
    kind: 'schedule',
    quantity: 0.5,
    time: '09:00',
    version: {
      id: '44444444-4444-4444-8444-444444444444',
      startDate: '2026-11-01',
      confirmedAt: '2026-10-31T21:00:00.000Z',
      replacedAt: null,
    },
  },
  {
    key: 'schedule:earlier',
    kind: 'schedule',
    quantity: 1.5,
    time: '20:00',
    version: {
      id: '55555555-5555-4555-8555-555555555555',
      startDate: '2026-10-01',
      confirmedAt: '2026-09-30T21:00:00.000Z',
      replacedAt: '2026-10-31T21:00:00.000Z',
    },
  },
]
function serveRepairQueue(stockTracked = false) {
  server.use(
    http.post('/api/medicines/type-correction', () =>
      HttpResponse.json({
        review: {
          medicineId: medicine.id,
          unit: 'capsule',
          fromUnit: 'tablet',
          revision: 1,
          reviewVersion: 5,
          stockTracked,
          compatibleAmounts: 7,
          conflicts: repairConflicts,
        },
      }),
    ),
  )
}
async function enterRepairQueue(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name: 'Capsule' }))
  await user.click(screen.getByRole('button', { name: 'Review Type change' }))
  await user.click(await screen.findByRole('button', { name: 'Check first amount' }))
}
test.each([true, false])(
  'Type repair preserves keyed raw entries through final review (Stock tracked: %s)',
  async (tracked) => {
    serveRepairQueue(tracked)
    const { user, onSaved } = open(
      'fix',
      tracked ? { ...medicine, stock: { tracked: true, count: 18, threshold: 5 } } : medicine,
    )
    await enterRepairQueue(user)
    const heading = 'How many capsules was this dose?'
    expect(screen.getByRole('heading', { name: heading })).toHaveFocus()
    expect(screen.getByText('Amount 1 of 4')).toBeVisible()
    expect(screen.getByText('Taken · Sun 1 Nov at 09:10')).toBeVisible()
    expect(screen.getByText(/Saved as/)).toHaveTextContent('½ tablet')
    const amount = () => screen.getByRole('textbox', { name: 'Amount' })
    expect(amount()).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Enter a quantity.')).toBeVisible()
    expect(amount()).toHaveFocus()
    await user.type(amount(), '1.5')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Use whole capsules.')).toBeVisible()
    expect(screen.getByText('Amount 1 of 4')).toBeVisible()
    expect(amount()).toHaveFocus()
    await user.clear(amount())
    await user.type(amount(), '02')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Amount 2 of 4')).toBeVisible()
    expect(screen.getByText('Taken · Mon 2 Nov at 21:15')).toBeVisible()
    expect(screen.getByText('Unscheduled dose')).toBeVisible()
    expect(amount()).toHaveValue('')
    await user.type(amount(), '3')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(amount()).toHaveValue('02')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(await screen.findByRole('button', { name: 'Check first amount' }))
    expect(amount()).toHaveValue('02')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(amount()).toHaveValue('3')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Amount 3 of 4')).toBeVisible()
    expect(screen.getByText('Current schedule · 09:00')).toBeVisible()
    expect(screen.getByText('From Sun 1 Nov')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'How many capsules per dose?' })).toHaveFocus()
    expect(amount()).toHaveValue('')
    await user.type(amount(), '4')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Amount 4 of 4')).toBeVisible()
    expect(screen.getByText('Earlier schedule · 20:00')).toBeVisible()
    expect(screen.getByText('Thu 1 Oct to Sun 1 Nov')).toBeVisible()
    expect(amount()).toHaveValue('')
    await user.type(amount(), '5')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(amount()).toHaveValue('4')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(amount()).toHaveValue('5')
    await user.click(
      screen.getByRole('button', { name: tracked ? 'Continue to Stock' : 'Review changes' }),
    )
    if (tracked) {
      const count = screen.getByRole('textbox', { name: 'Current count' })
      expect(count).toHaveValue('')
      await user.type(count, '16')
      await user.click(screen.getByRole('button', { name: 'Review changes' }))
      expect(screen.getByText('16 capsules')).toBeVisible()
    } else {
      expect(screen.getByText('Stays off')).toBeVisible()
    }
    expect(screen.getByRole('heading', { name: 'Review your changes' })).toHaveFocus()
    expect(screen.getByText('2 doses · 2 schedules')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Review entered amounts' }))
    expect(amount()).toHaveValue('02')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(amount()).toHaveValue('3')
    await user.clear(amount())
    await user.type(amount(), '3.5')
    await user.click(screen.getByRole('button', { name: 'Back to review' }))
    expect(amount()).toHaveFocus()
    await user.clear(amount())
    await user.type(amount(), '6')
    await user.click(screen.getByRole('button', { name: 'Back to review' }))
    expect(screen.getByRole('heading', { name: 'Review your changes' })).toHaveFocus()
    if (tracked) expect(screen.getByText('16 capsules')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Review entered amounts' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(amount()).toHaveValue('6')
    expect(onSaved).not.toHaveBeenCalled()
  },
)

// Catches repairs surviving explicit discard or disappearing during Session navigation.
test('Type repair Keep editing and remount retain the draft while Discard changes clears every entry without writes', async () => {
  serveRepairQueue()
  const writes = vi.fn()
  server.use(
    http.patch('/api/medicines', () => {
      writes()
      return HttpResponse.json({ error: 'unexpected' }, { status: 400 })
    }),
  )
  const { user, client, onSaved, onCancel, unmount } = open(
    'fix',
    medicine,
    medicine.strengthRevisions[0].id,
  )
  client.setQueryData(medicineKeys.list(), [medicine])
  await user.clear(screen.getByRole('textbox', { name: 'Name' }))
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Draft Magnesium')
  await user.clear(screen.getByRole('textbox', { name: 'Strength' }))
  await user.type(screen.getByRole('textbox', { name: 'Strength' }), '250 mg')
  await enterRepairQueue(user)
  await user.type(screen.getByRole('textbox', { name: 'Amount' }), '02')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.type(screen.getByRole('textbox', { name: 'Amount' }), '1.')
  await user.click(screen.getByRole('button', { name: 'Cancel change' }))
  expect(screen.getByRole('dialog', { name: 'Discard these changes?' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByText('Amount 2 of 4')).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('1.')
  unmount()
  function reopen() {
    return render(
      <QueryClientProvider client={client}>
        <SchedulingClockProvider serverNow="2026-11-15T07:00:00.000Z">
          <MedicineRecordForm
            medicine={medicine}
            mode="fix"
            periodId={medicine.strengthRevisions[0].id}
            onSaved={onSaved}
            onCancel={onCancel}
          />
        </SchedulingClockProvider>
      </QueryClientProvider>,
    )
  }
  const restored = reopen()
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Draft Magnesium')
  expect(screen.getByRole('textbox', { name: 'Strength' })).toHaveValue('250 mg')
  expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Capsule')
  await user.click(screen.getByRole('button', { name: 'Review Type change' }))
  await user.click(await screen.findByRole('button', { name: 'Check first amount' }))
  expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('02')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('1.')
  await user.click(screen.getByRole('button', { name: 'Cancel change' }))
  await user.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(onCancel).toHaveBeenCalledOnce()
  restored.unmount()
  reopen()
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Magnesium')
  expect(screen.getByRole('textbox', { name: 'Strength' })).toHaveValue('200 mg')
  await enterRepairQueue(user)
  expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('')
  expect(writes).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
  expect(client.getQueryData(medicineKeys.list())).toEqual([medicine])
})

// A lost response must preserve the entire atomic command across a route remount.
test('Type correction locks its submitted draft and retries the identical command after navigation', async () => {
  serveRepairQueue(true)
  const record: MedicineRecord = { ...medicine, stock: { tracked: true, count: 12, threshold: 3 } }
  const commands: Record<string, unknown>[] = []
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let saved: MedicineRecord = record
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [saved] })),
    http.patch('/api/medicines/type-correction', async ({ request }) => {
      const command = (await request.json()) as Record<string, unknown>
      commands.push(command)
      if (commands.length === 1) await held
      else saved = { ...record, revision: 2, lastActionId: command.actionId as string }
      return HttpResponse.error()
    }),
  )
  const { user, client, onSaved, onCancel, unmount } = open('fix', record)
  await enterRepairQueue(user)
  for (const quantity of ['2', '3', '4', '5']) {
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), quantity)
    await user.click(
      screen.getByRole('button', { name: quantity === '5' ? 'Continue to Stock' : 'Continue' }),
    )
  }
  await user.type(screen.getByRole('textbox', { name: 'Current count' }), '16')
  await user.click(screen.getByRole('button', { name: 'Review changes' }))
  await user.click(screen.getByRole('button', { name: 'Save details' }))
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Review entered amounts' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Cancel change' })).toBeNull()
  await waitFor(() =>
    expect(commands).toEqual([
      {
        actionId: expect.any(String),
        medicineId: record.id,
        expectedRevision: 1,
        reviewVersion: 5,
        unit: 'capsule',
        stockCount: 16,
        repairs: [
          { key: 'dose:scheduled', quantity: 2 },
          { key: 'dose:unscheduled', quantity: 3 },
          { key: 'schedule:current', quantity: 4 },
          { key: 'schedule:earlier', quantity: 5 },
        ],
        details: {
          strengthRevisionId: record.currentStrengthRevisionId,
          label: 'Magnesium',
          strength: '400 mg',
        },
      },
    ]),
  )
  unmount()
  release()
  render(
    <QueryClientProvider client={client}>
      <SchedulingClockProvider serverNow="2026-11-15T07:00:00.000Z">
        <MedicineRecordForm
          medicine={record}
          mode="fix"
          periodId={record.currentStrengthRevisionId}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      </SchedulingClockProvider>
    </QueryClientProvider>,
  )
  expect(await screen.findByText('That might not have saved.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Retry save' }))
  await waitFor(() => expect(commands).toHaveLength(2))
  expect(commands[1]).toEqual(commands[0])
  expect(await screen.findByText('Details saved')).toBeVisible()
  expect(onSaved).not.toHaveBeenCalled()
  expect(client.getQueryData(medicineKeys.list())).toBeUndefined()
})

// Definite rejection must keep the draft editable, and a changed preflight must
// prevent the edited attempt from silently applying to a new set of saved facts.
test('Type correction keeps rejected entries editable and restarts stale review from saved facts', async () => {
  serveRepairQueue(true)
  const record: MedicineRecord = { ...medicine, stock: { tracked: true, count: 12 } }
  const commands: Record<string, unknown>[] = []
  const fresh = {
    ...record,
    label: 'Saved Magnesium',
    strengthRevisions: record.strengthRevisions.map((period) => ({
      ...period,
      label: 'Saved Magnesium',
    })),
  }
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [fresh] })),
    http.patch('/api/medicines/type-correction', async ({ request }) => {
      commands.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({}, { status: commands.length === 1 ? 400 : 409 })
    }),
  )
  const { user, client } = open('fix', record)
  client.setQueryData(medicineKeys.list(), [record])
  await enterRepairQueue(user)
  for (const quantity of ['2', '3', '4', '5']) {
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), quantity)
    await user.click(
      screen.getByRole('button', { name: quantity === '5' ? 'Continue to Stock' : 'Continue' }),
    )
  }
  await user.type(screen.getByRole('textbox', { name: 'Current count' }), '16')
  await user.click(screen.getByRole('button', { name: 'Review changes' }))
  await user.click(screen.getByRole('button', { name: 'Save details' }))
  expect(await screen.findByText('Your changes weren’t saved.')).toBeVisible()
  expect(client.getQueryData(medicineKeys.list())).toEqual([record])
  await user.click(screen.getByRole('button', { name: 'Back' }))
  const count = screen.getByRole('textbox', { name: 'Current count' })
  expect(count).toHaveValue('16')
  await user.clear(count)
  await user.type(count, '18')
  await user.click(screen.getByRole('button', { name: 'Review changes' }))
  await user.click(screen.getByRole('button', { name: 'Try saving again' }))
  expect(await screen.findByText('This medication changed elsewhere.')).toBeVisible()
  expect(commands[1]?.actionId).not.toBe(commands[0]?.actionId)
  expect(commands[1]).toMatchObject({ stockCount: 18, reviewVersion: 5 })
  expect(client.getQueryData(medicineKeys.list())).toEqual([record])
  await user.click(screen.getByRole('button', { name: 'Review saved medication' }))
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Saved Magnesium'),
  )
  expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Tablet')
  expect(screen.getByRole('heading', { name: 'Edit details' })).toHaveFocus()
  await enterRepairQueue(user)
  expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('')
  expect(commands).toHaveLength(2)
})
