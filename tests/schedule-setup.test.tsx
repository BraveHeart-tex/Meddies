import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import type { DailySchedule } from '../src/features/schedules/contract'
import { scheduleToday } from '../src/features/schedules/occurrences'
import { ScheduleForm } from '../src/features/schedules/schedule-form'
import { scheduleFormDefaults } from '../src/features/schedules/schedule-form-schema'
import { SchedulePanel } from '../src/features/schedules/schedule-panel'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'
import { seedScheduleDraft } from './helpers/schedule-draft'
import { listedOption } from './helpers/select'
import { Toaster } from '../src/components/ui/toast'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/medications',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

// 09:00 on Friday 15 June in Istanbul.
const initialNow = '2035-06-15T06:00:00.000Z'
const scheduleId = '00000000-0000-4000-8000-0000000000a1'
const capsules: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Omega-3',
  strength: '1000 mg',
  unit: 'capsule',
}
const tablets: Medicine = {
  id: '00000000-0000-4000-8000-000000000002',
  label: 'Iron',
  strength: null,
  unit: 'tablet',
}
const syrup: Medicine = {
  id: '00000000-0000-4000-8000-000000000003',
  label: 'Amoxicillin',
  strength: '250 mg/5 ml',
  unit: 'liquid',
}

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
})
afterEach(() => {
  onlineManager.setOnline(true)
  client.clear()
  vi.restoreAllMocks()
})

type Respond = (payload: object) => Response | undefined | Promise<Response | undefined>

/** Serves one medicine and its schedules, recording every save. `respond` can override a save. */
function api(medicine: Medicine, initial: DailySchedule[] = [], respond?: Respond) {
  let schedules = initial
  const posted: Record<string, unknown>[] = []
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
    http.get('/api/schedules', () =>
      HttpResponse.json({
        schedules,
        records: [],
        today: scheduleToday(schedules, new Date(initialNow), []),
      }),
    ),
    http.post('/api/schedules', async ({ request }) => {
      const payload = (await request.json()) as Record<string, unknown>
      posted.push(payload)
      const response = await respond?.(payload)
      if (response) return response
      schedules = [{ ...payload, confirmedAt: initialNow } as DailySchedule]
      return HttpResponse.json({ schedules })
    }),
  )
  return { posted }
}

function panel(medicineId: string, mode: 'setup' | 'detail', onSaved: () => void) {
  return (
    <QueryClientProvider client={client}>
      <Toaster>
        <SchedulePanel
          mode={mode}
          initialMedicineId={medicineId}
          initialNow={initialNow}
          onScheduleSaved={onSaved}
        />
      </Toaster>
    </QueryClientProvider>
  )
}

async function openSetup(medicineId: string) {
  const onSaved = vi.fn()
  const view = render(panel(medicineId, 'setup', onSaved))
  await waitFor(() =>
    expect(document.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument(),
  )
  return { ...view, user: userEvent.setup({ delay: null }), onSaved }
}

type User = ReturnType<typeof userEvent.setup>
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const save = () => button('Save schedule')
const addTime = () => button('Add another time')
const hour = (row: number) => screen.getByRole('combobox', { name: `Time ${row} hour` })
const minute = (row: number) => screen.getByRole('combobox', { name: `Time ${row} minute` })
const quantity = (row: number) => screen.getByLabelText(`Amount for time ${row}`)
const step = (row: number, direction: 'Fewer' | 'More') =>
  button(`${direction}: Time ${row} amount`)
const startDate = () => button(/^Start date, /)
const days = () => screen.getByRole('group', { name: 'Days' })

async function pickPart(user: User, trigger: HTMLElement, value: string) {
  await user.click(trigger)
  await user.click(await listedOption(value))
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}
async function pickTime(user: User, row: number, time: string) {
  const [hh, mm] = time.split(':')
  await pickPart(user, hour(row), hh)
  await pickPart(user, minute(row), mm)
}
async function pickDate(user: User, date: string) {
  await user.click(startDate())
  const calendar = await screen.findByRole('dialog', { name: 'Start date' })
  await user.click(calendar.querySelector(`button[data-day="${date}"]`)!)
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Start date' })).not.toBeInTheDocument(),
  )
}
async function typeQuantity(user: User, row: number, value: string) {
  await user.clear(quantity(row))
  if (value) await user.paste(value)
}

test('setup opens with the medicine, Istanbul time and one row that cannot be removed', async () => {
  api(capsules)
  await openSetup(capsules.id)
  expect(screen.getByRole('heading', { name: 'Omega-3' })).toBeVisible()
  expect(
    screen.getByText('Times use Istanbul time. Only doses after saving are added.'),
  ).toBeVisible()
  expect(startDate()).toHaveTextContent('Today, Fri 15 Jun')
  expect(days()).toHaveAccessibleDescription('Every day')
  expect(quantity(1)).toHaveValue('1')
  expect(screen.queryByRole('button', { name: /^Remove time/ })).not.toBeInTheDocument()
})

test('capsules step by one and stop at one', async () => {
  api(capsules)
  const { user } = await openSetup(capsules.id)
  expect(step(1, 'Fewer')).toBeDisabled()
  await user.click(step(1, 'More'))
  expect(quantity(1)).toHaveValue('2')
  expect(quantity(1)).toHaveAccessibleDescription('capsules')
  await user.click(step(1, 'Fewer'))
  expect(quantity(1)).toHaveValue('1')
  expect(quantity(1)).toHaveAccessibleDescription('capsule')
  expect(step(1, 'Fewer')).toBeDisabled()
})

test('tablets step by half, stop at half and name the unit', async () => {
  const { posted } = api(tablets)
  const { user } = await openSetup(tablets.id)
  expect(quantity(1)).toHaveValue('1')
  expect(quantity(1)).toHaveAccessibleDescription('tablet')
  await user.click(step(1, 'Fewer'))
  expect(quantity(1)).toHaveValue('½')
  expect(step(1, 'Fewer')).toBeDisabled()
  await user.click(step(1, 'More'))
  await user.click(step(1, 'More'))
  expect(quantity(1)).toHaveValue('1½')
  expect(quantity(1)).toHaveAccessibleDescription('tablets')
  await typeQuantity(user, 1, '0')
  await pickTime(user, 1, '07:30')
  await user.click(save())
  await waitFor(() => expect(quantity(1)).toHaveFocus())
  expect(quantity(1)).toHaveAccessibleDescription(/Use ½ tablet or more\./)
  expect(posted).toEqual([])
})

// #265: catches a Clock row that steps, validates or saves Liquid off the 0.1 ml grid.
test('Liquid steps by 0.1 ml, shows both ml errors and saves decimal amounts (#265)', async () => {
  const { posted } = api(syrup)
  const { user, onSaved } = await openSetup(syrup.id)
  expect(quantity(1)).toHaveValue('1')
  expect(quantity(1)).toHaveAccessibleDescription('ml')
  await user.click(step(1, 'Fewer'))
  expect(quantity(1)).toHaveValue('0.9')
  await typeQuantity(user, 1, '0.1')
  expect(step(1, 'Fewer')).toBeDisabled()
  await user.click(step(1, 'More'))
  expect(quantity(1)).toHaveValue('0.2')
  await pickTime(user, 1, '08:00')
  await user.click(addTime())
  await pickTime(user, 2, '20:00')

  await typeQuantity(user, 2, '1.25')
  await user.click(save())
  await waitFor(() => expect(quantity(2)).toHaveFocus())
  expect(quantity(2)).toHaveAccessibleDescription(/Use steps of 0\.1 ml, like 1\.2 ml\./)
  await typeQuantity(user, 2, '0')
  await user.click(save())
  expect(quantity(2)).toHaveAccessibleDescription(/Use 0\.1 ml or more\./)
  expect(posted).toEqual([])

  await typeQuantity(user, 2, '2.5')
  await user.click(save())
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(posted).toEqual([
    expect.objectContaining({
      times: [
        { time: '08:00', quantity: 0.2 },
        { time: '20:00', quantity: 2.5 },
      ],
    }),
  ])
})

test('time row ids are the same on every render with the same data', () => {
  const html = () =>
    renderToString(
      <QueryClientProvider client={client}>
        <SchedulingClockProvider serverNow={initialNow}>
          <ScheduleForm
            medicine={capsules}
            today="2035-06-15"
            serverNow={initialNow}
            onSaved={() => {}}
            onConflict={() => {}}
          />
        </SchedulingClockProvider>
      </QueryClientProvider>,
    )
  const ids = (markup: string) => [...markup.matchAll(/id="([^"]*dose-[^"]*)"/g)].map((m) => m[1])
  const first = html()
  expect(ids(first)).not.toEqual([])
  expect(ids(html())).toEqual(ids(first))
})

/** Every Time and Quantity label targets its own row's input, and no id repeats. */
function expectRowsLinked(count: number) {
  for (let row = 1; row <= count; row++) {
    const time = screen.getByText(`Time ${row}`, { selector: 'label' }) as HTMLLabelElement
    expect(document.getElementById(time.htmlFor)).toBe(hour(row))
    expect(screen.getByLabelText(`Amount for time ${row}`)).toBe(quantity(row))
  }
  const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
  expect(new Set(ids).size).toBe(ids.length)
}

test('new rows take focus, and errors and focus follow their rows through removals', async () => {
  const { posted } = api(capsules)
  const { user } = await openSetup(capsules.id)
  await pickTime(user, 1, '08:00')
  await user.click(addTime())
  await waitFor(() => expect(hour(2)).toHaveFocus())
  await user.click(addTime())
  await waitFor(() => expect(hour(3)).toHaveFocus())
  expect(button('Remove time 3')).toBeVisible()
  expectRowsLinked(3)

  await pickTime(user, 2, '08:00')
  await typeQuantity(user, 2, '')
  await pickTime(user, 3, '20:00')
  await typeQuantity(user, 3, '1.5')
  await user.click(save())
  await waitFor(() => expect(hour(2)).toHaveFocus())
  expect(hour(2)).toHaveAccessibleDescription('08:00 is already in this schedule.')
  expect(quantity(2)).toHaveAccessibleDescription(/Enter a quantity\./)
  expect(quantity(2)).toHaveValue('')
  expect(quantity(3)).toHaveAccessibleDescription(/Use whole capsules\./)
  expect(quantity(3)).toHaveAttribute('aria-invalid', 'true')
  expect(posted).toEqual([])

  await user.click(button('Remove time 2'))
  // The row that took its place, the former Time 3, gets focus and keeps its own error.
  await waitFor(() => expect(hour(2)).toHaveFocus())
  expect(hour(2)).toHaveTextContent('20')
  expect(screen.queryByText('08:00 is already in this schedule.')).not.toBeInTheDocument()
  expect(screen.queryByText('Enter a quantity.')).not.toBeInTheDocument()
  expect(quantity(2)).toHaveValue('1.5')
  expect(quantity(2)).toHaveAccessibleDescription(/Use whole capsules\./)
  expectRowsLinked(2)

  await user.click(step(2, 'More'))
  expect(quantity(2)).toHaveValue('2')
  await waitFor(() => expect(screen.queryByText('Use whole capsules.')).not.toBeInTheDocument())

  await user.click(button('Remove time 2'))
  await waitFor(() => expect(addTime()).toHaveFocus())
  expect(screen.queryByRole('button', { name: /^Remove time/ })).not.toBeInTheDocument()
})

const clockDraft = {
  ...scheduleFormDefaults(capsules.unit, '2035-06-15'),
  times: [{ time: '08:00', quantity: '1' }],
}

test('Set times setup confirms the same request from a Session draft and from empty inputs', async () => {
  const { posted: entered } = api(capsules)
  const ui = await openSetup(capsules.id)
  await pickTime(ui.user, 1, '08:00')
  await ui.user.click(save())
  await waitFor(() => expect(ui.onSaved).toHaveBeenCalledTimes(1))
  ui.unmount()
  client.clear()

  const { posted: restored } = api(capsules)
  seedScheduleDraft(client, capsules.id, { kind: 'times', values: clockDraft })
  const draft = await openSetup(capsules.id)
  await draft.user.click(save())
  await waitFor(() => expect(draft.onSaved).toHaveBeenCalledTimes(1))

  expect(entered).toHaveLength(1)
  expect(restored).toHaveLength(1)
  const [{ id: enteredId, ...enteredBody }] = entered
  const [{ id: restoredId, ...restoredBody }] = restored
  expect(enteredId).toEqual(expect.any(String))
  expect(restoredId).toEqual(expect.any(String))
  expect(restoredBody).toEqual(enteredBody)
})

test('known offline blocks saving and keeps the details until the connection returns', async () => {
  const { posted } = api(capsules)
  seedScheduleDraft(client, capsules.id, { kind: 'times', values: clockDraft })
  await openSetup(capsules.id)
  const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  act(() => {
    window.dispatchEvent(new Event('offline'))
  })
  expect(button('Connect to save')).toBeDisabled()
  expect(screen.getByText("You're offline.")).toBeVisible()
  expect(hour(1)).toHaveTextContent('08')
  onLine.mockReturnValue(true)
  act(() => {
    window.dispatchEvent(new Event('online'))
  })
  expect(save()).toBeEnabled()
  expect(screen.queryByText("You're offline.")).not.toBeInTheDocument()
  expect(hour(1)).toHaveTextContent('08')
  expect(posted).toEqual([])
})

test('a rejected save keeps the medicine and the details, and can be saved again', async () => {
  let reject = true
  const { posted } = api(capsules, [], () => {
    if (!reject) return undefined
    reject = false
    return HttpResponse.json({ error: 'validation' }, { status: 400 })
  })
  seedScheduleDraft(client, capsules.id, { kind: 'times', values: clockDraft })
  const { user, onSaved } = await openSetup(capsules.id)
  await user.click(save())
  expect(await screen.findByText("Schedule wasn't saved.")).toBeVisible()
  expect(screen.getByText(/^Omega-3 is saved without a schedule\./)).toBeVisible()
  expect(hour(1)).toHaveTextContent('08')
  expect(minute(1)).toHaveTextContent('00')
  expect(onSaved).not.toHaveBeenCalled()
  await user.click(save())
  // #377: the confirmation is a Toast with the first dose; the screen shows no status of its own.
  expect(
    await screen.findByRole('dialog', { name: 'Schedule saved for Omega-3.' }),
  ).toHaveTextContent('First dose: Sat 16 Jun at 08:00.')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(onSaved).toHaveBeenCalledTimes(1)
  expect(onSaved).toHaveBeenCalledWith(capsules)
  expect(posted).toHaveLength(2)
})

test('a medicine that already has a schedule opens a change to it (215·A2)', async () => {
  api(capsules, [
    {
      id: scheduleId,
      medicineId: capsules.id,
      startDate: '2035-06-15',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      times: [{ time: '08:00', quantity: 1 }],
      confirmedAt: initialNow,
    },
  ])
  await openSetup(capsules.id)
  expect(await screen.findByRole('button', { name: 'Save changes' })).toBeDisabled()
  expect(screen.getByText('Change schedule')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Save schedule' })).not.toBeInTheDocument()
})

test('an unknown medicine is not in the list and links back to Medications', async () => {
  api(capsules)
  await openSetup('00000000-0000-4000-8000-00000000ffff')
  expect(await screen.findByText("This medication isn't in your list")).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Save schedule' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open Medications' })).toHaveAttribute(
    'href',
    '/medications',
  )
})

test('no chosen weekday blocks the save, and a saved weekday shows its day and start', async () => {
  const { posted } = api(tablets)
  const { user, onSaved, rerender } = await openSetup(tablets.id)
  await pickDate(user, '2035-06-16')
  expect(startDate()).toHaveTextContent('Sat 16 Jun')
  await pickTime(user, 1, '23:59')

  for (const day of within(days()).getAllByRole('button')) await user.click(day)
  expect(within(days()).queryAllByRole('button', { pressed: true })).toHaveLength(0)
  await user.click(save())
  const monday = within(days()).getByRole('button', { name: 'Monday' })
  await waitFor(() => expect(monday).toHaveFocus())
  expect(screen.getByText('Choose at least one day.')).toBeVisible()
  expect(days()).toHaveAccessibleDescription('Choose at least one day. No days chosen')
  expect(posted).toEqual([])

  await user.click(monday)
  await waitFor(() =>
    expect(screen.queryByText('Choose at least one day.')).not.toBeInTheDocument(),
  )
  expect(days()).toHaveAccessibleDescription('Mon')
  await user.click(save())
  expect(await screen.findByText('Schedule saved for Iron.')).toBeVisible()
  expect(onSaved).toHaveBeenCalledTimes(1)

  rerender(panel(tablets.id, 'detail', onSaved))
  expect(await screen.findByText('Monday')).toBeVisible()
  expect(screen.getByText('23:59')).toBeVisible()
  expect(screen.getByText('1 tablet')).toBeVisible()
  expect(screen.getByText('Starts Sat 16 Jun')).toBeVisible()
})

test('every dose time needs both parts, pickers lock while saving and values save unchanged', async () => {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const { posted } = api(tablets, [], async () => {
    await held
    return undefined
  })
  const { user, onSaved } = await openSetup(tablets.id)
  await pickDate(user, '2035-06-17')
  await pickTime(user, 1, '23:45')
  await user.click(addTime())
  await pickPart(user, hour(2), '00')
  await typeQuantity(user, 2, '0.5')

  await user.click(save())
  await waitFor(() => expect(minute(2)).toHaveFocus())
  expect(hour(2)).toHaveAccessibleDescription('Choose a time.')
  expect(posted).toEqual([])
  expect(onSaved).not.toHaveBeenCalled()

  await pickPart(user, minute(2), '15')
  expect(hour(2)).toHaveTextContent('00')
  expect(minute(2)).toHaveTextContent('15')

  await user.click(save())
  await waitFor(() => expect(posted).toHaveLength(1))
  expect(button('Saving schedule...')).toBeDisabled()
  expect(startDate()).toBeDisabled()
  expect(hour(1)).toBeDisabled()
  expect(minute(1)).toBeDisabled()
  expect(hour(2)).toBeDisabled()
  expect(minute(2)).toBeDisabled()
  expect(quantity(2)).toBeDisabled()
  expect(addTime()).toBeDisabled()
  expect(button('Remove time 2')).toBeDisabled()
  release()

  expect(await screen.findByText('Schedule saved for Iron.')).toBeVisible()
  expect(posted).toEqual([
    {
      id: expect.any(String),
      medicineId: tablets.id,
      startDate: '2035-06-17',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      times: [
        { time: '23:45', quantity: 1 },
        { time: '00:15', quantity: 0.5 },
      ],
      endDate: null,
    },
  ])
})

test('a mismatched Schedule setup confirmation stays Unconfirmed and retries the same action', async () => {
  const { posted } = api(capsules, [], (payload) =>
    HttpResponse.json({
      schedules: [{ ...payload, endDate: '2035-06-20', confirmedAt: initialNow }],
    }),
  )
  const { user, onSaved } = await openSetup(capsules.id)
  await pickTime(user, 1, '08:00')
  await user.click(save())
  expect(await screen.findByRole('button', { name: 'Try saving schedule again' })).toBeEnabled()
  // Names which part might not have saved (#283 F24).
  expect(screen.getByText('Your schedule might not have saved.')).toBeVisible()
  expect(screen.getByText('Omega-3 itself is saved.')).toBeVisible()
  expect(hour(1)).toHaveTextContent('08')
  expect(onSaved).not.toHaveBeenCalled()
  await user.click(button('Try saving schedule again'))
  await waitFor(() => expect(posted).toHaveLength(2))
  expect(posted[0]).toHaveProperty('id', expect.any(String))
  expect(posted[1]).toEqual(posted[0])
})

test('an existing-schedule conflict keeps explicit recovery and does not confirm the attempt', async () => {
  api(capsules, [], () => HttpResponse.json({ error: 'conflict' }, { status: 409 }))
  seedScheduleDraft(client, capsules.id, { kind: 'times', values: clockDraft })
  const { user, onSaved } = await openSetup(capsules.id)
  await user.click(save())
  expect(await screen.findByText('Omega-3 already has a schedule.')).toBeVisible()
  expect(screen.getByRole('link', { name: 'View schedule' })).toHaveAttribute(
    'href',
    `/medications?medicine=${capsules.id}`,
  )
  expect(screen.queryByRole('button', { name: 'Save schedule' })).not.toBeInTheDocument()
  expect(onSaved).not.toHaveBeenCalled()
})

test('editing an unconfirmed schedule starts a new attempt', async () => {
  const { posted } = api(capsules, [], () => HttpResponse.error())
  const { user } = await openSetup(capsules.id)
  await pickTime(user, 1, '08:00')
  await user.click(save())
  await screen.findByRole('button', { name: 'Try saving schedule again' })
  await user.click(step(1, 'More'))
  await user.click(button('Try saving schedule again'))
  await waitFor(() => expect(posted).toHaveLength(2))
  expect(posted[1]).toMatchObject({ times: [{ time: '08:00', quantity: 2 }] })
  expect((posted[1] as { id: string }).id).not.toBe((posted[0] as { id: string }).id)
})

const lastDay = () => button(/^Last day, /)
async function pickLastDay(user: User, date: string) {
  await user.click(lastDay())
  const calendar = await screen.findByRole('dialog', { name: 'Last day' })
  await user.click(calendar.querySelector(`button[data-day="${date}"]`)!)
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Last day' })).not.toBeInTheDocument(),
  )
}

test('227·A1, A2 the optional Last day saves with the schedule and can be removed', async () => {
  const { posted } = api(capsules)
  const { user, onSaved } = await openSetup(capsules.id)
  expect(screen.getByText('Last day (optional)')).toBeVisible()
  expect(lastDay()).toHaveAccessibleName('Last day, not set')
  expect(lastDay()).toHaveAccessibleDescription('Leave it empty to keep going.')
  await pickLastDay(user, '2035-06-20')
  expect(lastDay()).toHaveAccessibleDescription('Doses on this day still count.')
  await user.click(button('Remove last day'))
  expect(lastDay()).toHaveAccessibleName('Last day, not set')
  expect(lastDay()).toHaveFocus()
  await pickLastDay(user, '2035-06-20')
  await pickTime(user, 1, '20:00')
  await user.click(save())
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(posted[0]).toMatchObject({ startDate: '2035-06-15', endDate: '2035-06-20' })
})

test('227·A3 a Last day before a later Start date shows its error after Save', async () => {
  const { posted } = api(capsules)
  const { user } = await openSetup(capsules.id)
  await pickTime(user, 1, '20:00')
  await pickLastDay(user, '2035-06-16')
  await pickDate(user, '2035-06-17')
  expect(screen.queryByText('Choose Sun 17 Jun or a later date.')).not.toBeInTheDocument()
  await user.click(save())
  expect(await screen.findByText('Choose Sun 17 Jun or a later date.')).toBeVisible()
  expect(lastDay()).toHaveAttribute('aria-invalid', 'true')
  expect(lastDay()).toHaveFocus()
  expect(posted).toEqual([])
})
