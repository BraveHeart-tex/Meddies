import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Toaster } from '../src/components/ui/toast'
import type { Medicine } from '../src/features/medicines/contract'
import { MedicinePanel } from '../src/features/medicines/medicine-panel'
import type { DailySchedule, DoseOutcomeRecord } from '../src/features/schedules/contract'
import { scheduleToday } from '../src/features/schedules/occurrences'
import { SchedulePanel } from '../src/features/schedules/schedule-panel'
import type { UnscheduledDose } from '../src/features/unscheduled-doses/contract'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

// Logging Inhaler and Drops doses (#265): the dose drawers step by whole puffs and drops, word
// them singular and plural and reject a dose below one. Catches a drawer that saves or words a
// puff or drop amount outside the shared quantity policy.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

// 10:00 on Saturday 14 November in Istanbul.
const now = '2026-11-14T07:00:00.000Z'
const inhaler: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Salbutamol',
  strength: '100 mcg per puff',
  unit: 'inhaler',
}
const drops: Medicine = {
  id: '00000000-0000-4000-8000-000000000002',
  label: 'Eye drops',
  strength: '0.5%',
  unit: 'drops',
}
/** 2 puffs at 08:00. */
const schedule: DailySchedule = {
  id: '00000000-0000-4000-8000-0000000000a1',
  medicineId: inhaler.id,
  startDate: '2026-11-14',
  times: [{ time: '08:00', quantity: 2 }],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  confirmedAt: '2026-10-31T09:00:00.000Z',
}

/** Serves one medicine and records every dose write with the Worker's echo. */
function api(medicine: Medicine, schedules: DailySchedule[] = []) {
  let records: DoseOutcomeRecord[] = []
  let unscheduled: UnscheduledDose[] = []
  const writes: Record<string, unknown>[] = []
  const saveRecord = async ({ request }: { request: Request }) => {
    const body = (await request.json()) as Record<string, unknown>
    writes.push(body)
    const revision = records.length
    const record = { ...body, revision } as unknown as DoseOutcomeRecord
    records = [record]
    return HttpResponse.json({ record })
  }
  const saveDose = async ({ request }: { request: Request }) => {
    const body = (await request.json()) as Record<string, unknown>
    writes.push(body)
    const current = unscheduled.find((item) => item.id === body.doseId)
    const dose: UnscheduledDose = {
      id: current?.id ?? String(body.actionId),
      actionId: String(body.actionId),
      medicineId: medicine.id,
      takenAt: String(body.takenAt),
      quantity: Number(body.quantity),
      outcome: 'Taken',
      revision: current ? current.revision + 1 : 0,
      removed: false,
    }
    unscheduled = [...unscheduled.filter((item) => item.id !== dose.id), dose]
    return HttpResponse.json({ dose })
  }
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
    http.get('/api/schedules', () =>
      HttpResponse.json({
        schedules,
        records,
        unscheduledDoses: unscheduled,
        today: scheduleToday(schedules, new Date(now), records),
      }),
    ),
    http.put('/api/schedules', saveRecord),
    http.patch('/api/schedules', saveRecord),
    http.post('/api/schedules/unscheduled', saveDose),
    http.patch('/api/schedules/unscheduled', saveDose),
  )
  return { writes }
}

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
})
afterEach(() => client.clear())

function renderWith(ui: React.ReactNode) {
  render(
    <QueryClientProvider client={client}>
      <Toaster>{ui}</Toaster>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

// The frame's "Taken at 08:00 · 2 puffs" is the drawer's recorded line, worded
// "Taken 2 puffs at 08:00" (recorded-outcome.tsx).
test('a scheduled Inhaler dose change reads "Taken 2 puffs at 08:00" and saves 1 puff (#265)', async () => {
  const { writes } = api(inhaler, [schedule])
  const user = renderWith(<SchedulePanel mode="today" initialNow={now} />)
  await user.click(
    await screen.findByRole('button', { name: 'Record dose for Salbutamol scheduled at 08:00' }),
  )
  const drawer = await screen.findByRole('dialog', { name: 'Salbutamol' })
  await user.click(within(drawer).getByRole('button', { name: 'I took it' }))
  await user.click(within(drawer).getByRole('button', { name: 'At 08:00' }))
  const amount = within(drawer).getByLabelText(/^Amount/)
  expect(amount).toHaveValue('2')
  expect(amount).toHaveAccessibleDescription('puffs')
  await user.click(within(drawer).getByRole('button', { name: 'Save as taken' }))
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toMatchObject({ outcome: 'Taken', quantity: 2 })

  await user.click(
    await screen.findByRole('button', { name: 'Review dose for Salbutamol scheduled at 08:00' }),
  )
  const review = await screen.findByRole('dialog', { name: 'Salbutamol' })
  expect(review).toHaveTextContent('Taken 2 puffs at 08:00')
  await user.click(
    within(review).getByRole('button', { name: 'Change time or amount, Salbutamol at 08:00' }),
  )
  const change = within(review).getByLabelText(/^Amount/)
  expect(change).toHaveValue('2')
  await user.click(within(review).getByRole('button', { name: 'Fewer: Amount' }))
  expect(change).toHaveValue('1')
  expect(change).toHaveAccessibleDescription('puff')
  expect(within(review).getByRole('button', { name: 'Fewer: Amount' })).toBeDisabled()
  await user.click(within(review).getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(writes).toHaveLength(2))
  expect(writes[1]).toMatchObject({ outcome: 'Taken', quantity: 1, expectedRevision: 0 })
  const list = screen.getByRole('list', { name: "Today's doses" })
  await waitFor(() => expect(list).toHaveTextContent('took 1 puff'))
})

test('an Unscheduled Drops dose at 0 shows "Use 1 drop or more." and blocks saving (#265)', async () => {
  const { writes } = api(drops)
  window.history.replaceState(null, '', `/medications?medicine=${drops.id}`)
  const user = renderWith(
    <MedicinePanel scheduleMode="detail" detailMedicineId={drops.id} initialNow={now} />,
  )
  await user.click(await screen.findByRole('button', { name: 'Log a dose' }))
  const drawer = await screen.findByRole('dialog', { name: 'Eye drops' })
  const amount = within(drawer).getByLabelText(/^Amount/)
  const save = within(drawer).getByRole('button', { name: 'Save as taken' })
  expect(amount).toHaveValue('1')
  expect(amount).toHaveAccessibleDescription('drop')
  await user.clear(amount)
  await user.paste('0')
  await user.click(save)
  expect(await within(drawer).findByText('Use 1 drop or more.')).toBeVisible()
  await user.clear(amount)
  await user.paste('1.5')
  await user.click(save)
  expect(await within(drawer).findByText('Use whole drops.')).toBeVisible()
  expect(writes).toEqual([])
  await user.clear(amount)
  await user.paste('2')
  expect(amount).toHaveAccessibleDescription(/^drops/)
  await user.click(save)
  expect(await screen.findByText('Eye drops · Taken at 10:00, 2 drops')).toBeVisible()
  expect(writes[0]).toMatchObject({ medicineId: drops.id, quantity: 2 })
})
