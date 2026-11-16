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

// Logging Liquid doses in ml (#265): the dose drawers step by 0.1 ml, save decimals and
// word them in ml. Catches a drawer that steps, saves or words a Liquid amount outside the
// shared quantity policy.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

// 14:00 on Saturday 14 November in Istanbul.
const now = '2026-11-14T11:00:00.000Z'
const syrup: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Amoxicillin',
  strength: '250 mg/5 ml',
  unit: 'liquid',
}
/** 5 ml at 14:00, due now. */
const schedule: DailySchedule = {
  id: '00000000-0000-4000-8000-0000000000a1',
  medicineId: syrup.id,
  startDate: '2026-11-14',
  times: [{ time: '14:00', quantity: 5 }],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  confirmedAt: '2026-10-31T09:00:00.000Z',
}
/** 0.5 ml at 12:30, not on a schedule. */
const noonDose: UnscheduledDose = {
  id: '77777777-7777-4777-8777-000000000001',
  actionId: '88888888-8888-4888-8888-000000000001',
  medicineId: syrup.id,
  takenAt: '2026-11-14T09:30:00.000Z',
  quantity: 0.5,
  outcome: 'Taken',
  revision: 0,
  removed: false,
}

/** Serves one Liquid medicine and records every dose write with the Worker's echo. */
function api({ schedules = [] as DailySchedule[], doses = [] as UnscheduledDose[] } = {}) {
  let records: DoseOutcomeRecord[] = []
  let unscheduled = doses
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
      medicineId: syrup.id,
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
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [syrup] })),
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

async function pickTime(user: ReturnType<typeof userEvent.setup>, time: string) {
  for (const [part, value] of [
    ['hour', time.slice(0, 2)],
    ['minute', time.slice(3)],
  ] as const) {
    await user.click(screen.getByRole('combobox', { name: `Taken time in Istanbul ${part}` }))
    await user.click(await screen.findByRole('option', { name: value }))
  }
}

test('a scheduled Liquid dose saves as taken and changes in 0.1 ml steps', async () => {
  const { writes } = api({ schedules: [schedule] })
  const user = renderWith(<SchedulePanel mode="today" initialNow={now} />)
  await user.click(await screen.findByRole('button', { name: 'I took it, Amoxicillin at 14:00' }))
  const drawer = await screen.findByRole('dialog', { name: 'Amoxicillin' })
  const amount = within(drawer).getByLabelText(/^Amount/)
  expect(amount).toHaveValue('5')
  expect(amount).toHaveAccessibleDescription('ml')
  await user.click(within(drawer).getByRole('button', { name: 'Fewer: Amount' }))
  expect(amount).toHaveValue('4.9')
  await user.click(within(drawer).getByRole('button', { name: 'Save as taken' }))
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toMatchObject({ outcome: 'Taken', quantity: 4.9 })
  const list = await screen.findByRole('list', { name: "Today's doses" })
  await waitFor(() => expect(list).toHaveTextContent('took 4.9 ml'))

  await user.click(screen.getByRole('button', { name: /^Review dose for Amoxicillin/ }))
  await user.click(
    await screen.findByRole('button', { name: 'Change time or amount, Amoxicillin at 14:00' }),
  )
  const change = within(screen.getByRole('dialog', { name: 'Amoxicillin' })).getByLabelText(
    /^Amount/,
  )
  expect(change).toHaveValue('4.9')
  await user.click(screen.getByRole('button', { name: 'More: Amount' }))
  expect(change).toHaveValue('5')
  expect(change).toHaveAccessibleDescription('ml')
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(writes).toHaveLength(2))
  expect(writes[1]).toMatchObject({ outcome: 'Taken', quantity: 5, expectedRevision: 0 })
})

test('an Unscheduled Liquid dose saves in ml and shows both ml errors', async () => {
  const { writes } = api()
  window.history.replaceState(null, '', `/medications?medicine=${syrup.id}`)
  const user = renderWith(
    <MedicinePanel scheduleMode="detail" detailMedicineId={syrup.id} initialNow={now} />,
  )
  await user.click(await screen.findByRole('button', { name: 'Log a dose' }))
  const drawer = await screen.findByRole('dialog', { name: 'Amoxicillin' })
  const amount = within(drawer).getByLabelText(/^Amount/)
  const save = within(drawer).getByRole('button', { name: 'Save as taken' })
  expect(amount).toHaveValue('1')
  expect(amount).toHaveAccessibleDescription('ml')
  await user.clear(amount)
  await user.paste('0.55')
  await user.click(save)
  expect(await within(drawer).findByText('Use steps of 0.1 ml, like 1.2 ml.')).toBeVisible()
  await user.clear(amount)
  await user.paste('0')
  await user.click(save)
  expect(await within(drawer).findByText('Use 0.1 ml or more.')).toBeVisible()
  expect(writes).toEqual([])
  await user.clear(amount)
  await user.paste('0.5')
  await user.click(save)
  expect(await screen.findByText('Amoxicillin · Taken at 14:00, 0.5 ml')).toBeVisible()
  expect(writes[0]).toMatchObject({ medicineId: syrup.id, quantity: 0.5 })
})

test('changing an Unscheduled Liquid dose reads "Taken at 13:10, 2.5 ml"', async () => {
  const { writes } = api({ doses: [noonDose] })
  const user = renderWith(<SchedulePanel mode="today" initialNow={now} />)
  await user.click(
    await screen.findByRole('button', {
      name: 'Review dose for Amoxicillin taken at 12:30, not on a schedule',
    }),
  )
  const drawer = await screen.findByRole('dialog', { name: 'Amoxicillin' })
  const amount = within(drawer).getByLabelText(/^Amount/)
  expect(amount).toHaveValue('0.5')
  expect(amount).toHaveAccessibleDescription('ml')
  await pickTime(user, '13:10')
  await user.clear(amount)
  await user.paste('2.4')
  await user.click(within(drawer).getByRole('button', { name: 'More: Amount' }))
  expect(amount).toHaveValue('2.5')
  await user.click(within(drawer).getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByText('Amoxicillin · Taken at 13:10, 2.5 ml')).toBeVisible()
  expect(writes[0]).toMatchObject({
    doseId: noonDose.id,
    takenAt: '2026-11-14T10:10:00.000Z',
    quantity: 2.5,
  })
})
