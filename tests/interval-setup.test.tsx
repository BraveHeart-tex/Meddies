import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import type { DailySchedule } from '../src/features/schedules/contract'
import { scheduleToday } from '../src/features/schedules/occurrences'
import { SchedulePanel } from '../src/features/schedules/schedule-panel'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/medications',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

// 10:00 on Monday 9 November in Istanbul, the worked example in FE-764.
const initialNow = '2026-11-09T07:00:00.000Z'
const scheduleId = '00000000-0000-4000-8000-0000000000a1'
const magnesium: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Magnesium',
  strength: '400 mg',
  unit: 'tablet',
}

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
  window.history.replaceState(null, '', `/medications?schedule=${magnesium.id}`)
})
afterEach(() => {
  client.clear()
  vi.restoreAllMocks()
})

type Respond = (payload: object) => Response | undefined

function api(initial: DailySchedule[] = [], respond?: Respond) {
  let schedules = initial
  const posted: Record<string, unknown>[] = []
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [magnesium] })),
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
      const response = respond?.(payload)
      if (response) return response
      schedules = [{ ...payload, confirmedAt: initialNow } as DailySchedule]
      return HttpResponse.json({ schedules })
    }),
  )
  return { posted }
}

function panel(mode: 'setup' | 'list' | 'detail', onSaved = vi.fn()) {
  return (
    <QueryClientProvider client={client}>
      <SchedulePanel
        mode={mode}
        initialMedicineId={magnesium.id}
        initialNow={initialNow}
        onScheduleSaved={onSaved}
      />
    </QueryClientProvider>
  )
}

type User = ReturnType<typeof userEvent.setup>

async function openSetup() {
  const onSaved = vi.fn()
  const view = render(panel('setup', onSaved))
  await screen.findByRole('button', { name: 'Save schedule' })
  return { ...view, user: userEvent.setup(), onSaved }
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const everyRow = () => button(/^Every:/)
const startsRow = () => button(/^Starts:/)
const takeRow = () => button(/^Take:/)
const sheet = (name: string) => screen.findByRole('dialog', { name })
const nextDoses = () => screen.getByRole('region', { name: 'Next 3 doses' })
const doseLines = () =>
  within(nextDoses())
    .getAllByRole('listitem')
    .map((item) => item.textContent)

async function chooseEveryFewHours(user: User) {
  await user.click(button('Every few hours'))
  await waitFor(() => expect(everyRow()).toBeVisible())
}

async function sheetClosed(name: string) {
  await waitFor(() => expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument())
}

async function chooseHours(user: User, label: string) {
  await user.click(everyRow())
  const dialog = await sheet('Every')
  await user.click(within(dialog).getByRole('button', { name: label }))
  await user.click(within(dialog).getByRole('button', { name: 'Done' }))
  await sheetClosed('Every')
}

async function pickPart(user: User, name: string, value: string) {
  await user.click(screen.getByRole('combobox', { name }))
  await user.click(await screen.findByRole('option', { name: value }))
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}

async function chooseFirstTime(user: User, time: string) {
  const [hour, minute] = time.split(':')
  await user.click(startsRow())
  const dialog = await sheet('Starts')
  await pickPart(user, 'First time hour', hour)
  await pickPart(user, 'First time minute', minute)
  await user.click(within(dialog).getByRole('button', { name: 'Done' }))
  await sheetClosed('Starts')
}

async function fillIn(user: User, hours = '8 hours', time = '08:00') {
  await chooseEveryFewHours(user)
  await chooseHours(user, hours)
  await chooseFirstTime(user, time)
}

describe('choosing a kind of schedule', () => {
  test('764·C0 opens on Set times with the existing form', async () => {
    api()
    await openSetup()
    expect(button('Set times')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('group', { name: 'Days' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toBeVisible()
  })

  test('764·C1 Every few hours asks Every, Starts and Take with no day picker', async () => {
    api()
    const { user } = await openSetup()
    await chooseEveryFewHours(user)
    expect(everyRow()).toHaveAccessibleName('Every: Choose')
    expect(startsRow()).toHaveAccessibleName('Starts: Choose')
    expect(takeRow()).toHaveAccessibleName('Take: 1 tablet')
    expect(screen.queryByRole('group', { name: 'Days' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Times are Istanbul time/)).not.toBeInTheDocument()
    expect(within(nextDoses()).getByText("They'll show here.")).toBeVisible()
  })
})

describe('sheets', () => {
  test('764·C3, C9 offers presets and exact hours from Other', async () => {
    api()
    const { user } = await openSetup()
    await chooseEveryFewHours(user)
    await user.click(everyRow())
    const dialog = await sheet('Every')
    for (const name of ['4 hours', '6 hours', '8 hours', '12 hours', '24 hours', 'Other'])
      expect(within(dialog).getByRole('button', { name })).toBeVisible()
    expect(within(dialog).getByText("A late dose doesn't move later times.")).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Other' }))
    await user.type(within(dialog).getByLabelText('Exact hours'), '7')
    expect(within(dialog).getByText('Whole hours, from 1 to 24.')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await sheetClosed('Every')
    expect(everyRow()).toHaveAccessibleName('Every: 7 hours')
  })

  test('764·C10, C11 Done stays open on an invalid answer and shows the problem', async () => {
    api()
    const { user } = await openSetup()
    await chooseEveryFewHours(user)
    await user.click(everyRow())
    const dialog = await sheet('Every')
    await user.click(within(dialog).getByRole('button', { name: 'Other' }))
    const hours = within(dialog).getByLabelText('Exact hours')
    await user.type(hours, '1.5')
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(await within(dialog).findByText('Use whole hours, like 8.')).toBeVisible()
    await user.clear(hours)
    expect(within(dialog).queryByText('Use whole hours, like 8.')).not.toBeInTheDocument()
    await user.type(hours, '25')
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(await within(dialog).findByText('Use 1 to 24 hours.')).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Every' })).toBeVisible()
  })

  test('Cancel restores the previous answer', async () => {
    api()
    const { user } = await openSetup()
    await chooseEveryFewHours(user)
    await chooseHours(user, '8 hours')
    await user.click(everyRow())
    const dialog = await sheet('Every')
    await user.click(within(dialog).getByRole('button', { name: '12 hours' }))
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await sheetClosed('Every')
    expect(everyRow()).toHaveAccessibleName('Every: 8 hours')
  })

  test('764·C14 Starts needs a first time; C5 Take shows its help', async () => {
    api()
    const { user } = await openSetup()
    await chooseEveryFewHours(user)
    await user.click(startsRow())
    const starts = await sheet('Starts')
    expect(within(starts).getByRole('button', { name: 'Today' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(within(starts).getByRole('button', { name: 'Done' }))
    expect(await within(starts).findByText('Choose a time.')).toBeVisible()
    await user.click(within(starts).getByRole('button', { name: 'Cancel' }))
    await sheetClosed('Starts')
    await user.click(takeRow())
    const take = await sheet('Take')
    expect(
      within(take).getByText(
        'Quantity is how much you take each time, not the strength on the pack.',
      ),
    ).toBeVisible()
  })

  test('an invalid quantity keeps Take open and is explained', async () => {
    api()
    const { user } = await openSetup()
    await chooseEveryFewHours(user)
    await user.click(takeRow())
    const dialog = await sheet('Take')
    await user.clear(within(dialog).getByLabelText('Quantity'))
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(await within(dialog).findByText('Enter a quantity.')).toBeVisible()
  })
})

describe('saving with answers missing', () => {
  test('764·C6 shows each problem on its row, focuses the first and posts nothing', async () => {
    const { posted } = api()
    const { user } = await openSetup()
    await chooseEveryFewHours(user)
    await user.click(button('Save schedule'))
    expect(await screen.findByText('Choose how many hours.')).toBeVisible()
    expect(screen.getByText('Choose a time.')).toBeVisible()
    expect(everyRow()).toHaveFocus()
    expect(everyRow()).toHaveAccessibleDescription('Choose how many hours.')
    expect(posted).toHaveLength(0)
  })
})

describe('next 3 doses', () => {
  test('764·C2 shows the first real dose after a first time earlier today', async () => {
    api()
    const { user } = await openSetup()
    await fillIn(user)
    expect(startsRow()).toHaveAccessibleName('Starts: Today, 08:00')
    expect(doseLines()).toEqual(['16:00Today', '00:00Tue 10 Nov', '08:00Tue 10 Nov'])
    expect(within(nextDoses()).getByText('Includes a dose overnight, at 00:00.')).toBeVisible()
    expect(within(nextDoses()).getAllByLabelText('Overnight')).toHaveLength(1)
  })

  test('764·C15 starts from a future first time, updating as values change', async () => {
    api()
    const { user } = await openSetup()
    await fillIn(user, '4 hours', '12:00')
    expect(doseLines()).toEqual(['12:00Today', '16:00Today', '20:00Today'])
    await chooseHours(user, '6 hours')
    expect(doseLines()).toEqual(['12:00Today', '18:00Today', '00:00Tue 10 Nov'])
  })

  test('764·C16 lists doses after midnight on their own day', async () => {
    api()
    const { user } = await openSetup()
    await fillIn(user, '6 hours', '20:00')
    expect(doseLines()).toEqual(['20:00Today', '02:00Tue 10 Nov', '08:00Tue 10 Nov'])
  })
})

describe('saving', () => {
  test('a confirmed save posts one Interval schedule', async () => {
    const { posted } = api()
    const { user, onSaved } = await openSetup()
    await fillIn(user)
    await user.click(button('Save schedule'))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({
      medicineId: magnesium.id,
      startDate: '2026-11-09',
      intervalHours: 8,
      times: [{ time: '08:00', quantity: 1 }],
    })
  })

  test('an unconfirmed retry keeps the values and repeats the same attempt', async () => {
    let offline = true
    const { posted } = api([], () =>
      offline ? new HttpResponse(null, { status: 503 }) : undefined,
    )
    const { user, onSaved } = await openSetup()
    await fillIn(user)
    await user.click(button('Save schedule'))
    const retry = await screen.findByRole('button', { name: 'Try saving schedule again' })
    expect(everyRow()).toHaveAccessibleName('Every: 8 hours')
    offline = false
    await user.click(retry)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(posted).toHaveLength(2)
    expect(posted[1]).toEqual(posted[0])
  })

  test('an unconfirmed Interval save reopens on Every few hours', async () => {
    api([], () => new HttpResponse(null, { status: 503 }))
    const { user, unmount } = await openSetup()
    await fillIn(user)
    await user.click(button('Save schedule'))
    await screen.findByRole('button', { name: 'Try saving schedule again' })
    unmount()
    render(panel('setup'))
    expect(await screen.findByRole('button', { name: 'Try saving schedule again' })).toBeVisible()
    expect(everyRow()).toHaveAccessibleName('Every: 8 hours')
  })

  test('a session draft restores the kind and the interval values', async () => {
    api()
    const { user, unmount } = await openSetup()
    await chooseEveryFewHours(user)
    await chooseHours(user, '12 hours')
    unmount()
    render(panel('setup'))
    await screen.findByRole('button', { name: 'Save schedule' })
    await waitFor(() => expect(everyRow()).toHaveAccessibleName('Every: 12 hours'))
    expect(
      screen.getByText('Pick up where you left off. Your details are still here.'),
    ).toBeVisible()
  })
})

describe('Cancel', () => {
  const detailSearch = `?medicine=${magnesium.id}`

  test('leaves straight away with no edits', async () => {
    api()
    const { user } = await openSetup()
    await chooseEveryFewHours(user)
    await user.click(button('Cancel'))
    expect(window.location.search).toBe(detailSearch)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('764·C7 asks first with edits, and Keep editing stays', async () => {
    api()
    const { user } = await openSetup()
    await fillIn(user)
    await user.click(button('Cancel'))
    const dialog = await sheet('Discard this schedule?')
    expect(within(dialog).getByText("The details you entered won't be saved.")).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await sheetClosed('Discard this schedule?')
    expect(window.location.search).toBe(`?schedule=${magnesium.id}`)
    expect(everyRow()).toHaveAccessibleName('Every: 8 hours')
  })

  test('asks first for edits on Set times too', async () => {
    api()
    const { user } = await openSetup()
    await pickPart(user, 'Time 1 hour', '08')
    await user.click(button('Cancel'))
    expect(await sheet('Discard this schedule?')).toBeVisible()
  })

  test('Discard clears the draft and an unconfirmed save, then leaves', async () => {
    api([], () => new HttpResponse(null, { status: 503 }))
    const { user, unmount } = await openSetup()
    await fillIn(user)
    await user.click(button('Save schedule'))
    await screen.findByRole('button', { name: 'Try saving schedule again' })
    await user.click(button('Cancel'))
    const dialog = await sheet('Discard this schedule?')
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }))
    expect(window.location.search).toBe(detailSearch)
    unmount()
    render(panel('setup'))
    await screen.findByRole('button', { name: 'Save schedule' })
    expect(button('Set times')).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.queryByText('Pick up where you left off. Your details are still here.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try saving schedule again' })).toBeNull()
  })
})

function intervalSchedule(hours: number, startDate: string, time: string): DailySchedule {
  return {
    id: scheduleId,
    medicineId: magnesium.id,
    startDate,
    times: [{ time, quantity: 1 }],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    intervalHours: hours,
    endDate: null,
    confirmedAt: '2026-11-03T18:00:00.000Z',
  }
}

describe('showing an Interval schedule', () => {
  function renderMode(mode: 'list' | 'detail') {
    window.history.replaceState(null, '', '/medications')
    render(panel(mode))
  }

  test('764·M1 the row names the hours and a next dose today', async () => {
    api([intervalSchedule(7, '2026-11-03', '22:00')])
    renderMode('list')
    expect(await screen.findByText('Every 7 hours · Next at 11:00')).toBeVisible()
  })

  test('764·M1 the row names the day when the next dose is not today', async () => {
    api([intervalSchedule(24, '2026-11-10', '09:00')])
    renderMode('list')
    expect(await screen.findByText('Every 24 hours · Next Tue 10 Nov at 09:00')).toBeVisible()
  })

  test('764·D1 the detail card lists doses without a drift note when hours divide 24', async () => {
    api([intervalSchedule(8, '2026-11-09', '08:00')])
    renderMode('detail')
    expect(await screen.findByText('Every 8 hours')).toBeVisible()
    expect(screen.getByText('Next 3 doses')).toBeVisible()
    expect(screen.getByText('1 tablet each time')).toBeVisible()
    expect(screen.getByText('Started Mon 9 Nov at 08:00')).toBeVisible()
    expect(screen.queryByText(/These times move/)).not.toBeInTheDocument()
  })

  test('764·D2 explains why the times move when hours do not divide 24', async () => {
    api([intervalSchedule(7, '2026-11-03', '22:00')])
    renderMode('detail')
    expect(await screen.findByText('Every 7 hours')).toBeVisible()
    expect(screen.getByText('Started Tue 3 Nov at 22:00')).toBeVisible()
    expect(
      screen.getByText(
        "These times move through the day, because 7 hours doesn't fit evenly into 24.",
      ),
    ).toBeVisible()
  })
})
