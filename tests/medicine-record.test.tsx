import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { MedicineRecordScreen } from '../src/features/medicines/medicine-record-screen'
import { useMedicines } from '../src/features/medicines/queries'
import { scheduleKeys, type ScheduleSnapshot } from '../src/features/schedules/queries'
import { MedicineRecordForm } from '../src/features/medicines/medicine-record-form'
import type { MedicineRecord } from '../src/features/medicines/contract'
import { writeSessionDraft } from '../src/lib/session-drafts'
import { medicineRecordKey } from '../src/features/medicines/use-medicine-record-save'
import { createQueryClient } from '../src/lib/session-query-client'
import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import { server } from './helpers/msw-server'

export const medicine: MedicineRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Magnesium',
  strength: '400 mg',
  unit: 'tablet',
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
test('selected-period correction saves only after confirmation and locks used Type', async () => {
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
  expect(screen.queryByRole('combobox', { name: 'Type' })).not.toBeInTheDocument()
  expect(screen.getByText(/Dose unit: tablets/)).toBeVisible()
  expect(
    screen.getByText('These changes also update doses recorded for this period.'),
  ).toBeVisible()
  expect(
    screen.getByText('Type and dose unit can’t change after adding a schedule or dose.'),
  ).toBeVisible()
  await user.clear(screen.getByRole('textbox', { name: /Strength/ }))
  await user.type(screen.getByRole('textbox', { name: /Strength/ }), '250 mg')
  await user.click(screen.getByRole('button', { name: 'Save fixed details' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  expect(payload).toMatchObject({
    strengthRevisionId: medicine.strengthRevisions[0].id,
    strength: '250 mg',
    expectedRevision: 1,
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
  await user.click(screen.getByRole('button', { name: 'Save fixed details' }))
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
  expect(await screen.findByRole('button', { name: 'Save fixed details' })).toBeEnabled()
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

test('never-used Type changes its matching Quantity unit; any past dose locks it', async () => {
  const { user } = open('fix', { ...medicine, everHadSchedule: false, everHadDose: false })
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  expect(await screen.findAllByRole('option')).toHaveLength(5)
  await user.click(screen.getByRole('option', { name: 'Capsule' }))
  expect(screen.getByText(/Dose unit: capsules/)).toBeVisible()
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
  await first.user.click(screen.getByRole('button', { name: 'Save fixed details' }))
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
  expect(await screen.findByText('400 mg · Current')).toBeVisible()
  expect(screen.getByText('200 mg · Earlier strength')).toBeVisible()
  expect(screen.queryByText(/1901/)).not.toBeInTheDocument()
  expect(screen.getByText(/First strength period/)).toBeVisible()
  expect(
    screen.getByText(
      'Fixing a mistake updates that period’s doses. A strength change keeps earlier doses unchanged.',
    ),
  ).toBeVisible()
  expect(screen.getAllByRole('link', { name: 'Fix a mistake in this period' })[1]).toHaveAttribute(
    'href',
    expect.stringContaining(`period=${medicine.strengthRevisions[0].id}`),
  )
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
  await user.click(screen.getByRole('button', { name: 'Save fixed details' }))
  await screen.findByRole('button', { name: 'Review saved medication' })
  expect(expectedRevision).toBe(0)
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Old draft')
})
