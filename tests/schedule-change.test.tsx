import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import { ALL_WEEKDAYS } from '../src/features/schedules/weekdays'
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

// 10:00 on Monday 9 November in Istanbul, the worked example in #215.
const initialNow = '2026-11-09T07:00:00.000Z'
const magnesium: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Magnesium',
  strength: '400 mg',
  unit: 'tablet',
}
const setupSearch = `?schedule=${magnesium.id}`
const detailSearch = `?medicine=${magnesium.id}`

/** Every day at 08:00 and 20:00 since Mon 2 Nov (767·A2). */
const clockVersion: DailySchedule = {
  id: '00000000-0000-4000-8000-0000000000a1',
  medicineId: magnesium.id,
  startDate: '2026-11-02',
  times: [
    { time: '08:00', quantity: 1 },
    { time: '20:00', quantity: 1 },
  ],
  weekdays: [...ALL_WEEKDAYS],
  endDate: null,
  intervalHours: null,
  confirmedAt: '2026-11-01T18:00:00.000Z',
}
/** Every 8 hours from Mon 2 Nov at 08:00 (767·A4). */
const intervalVersion: DailySchedule = {
  ...clockVersion,
  times: [{ time: '08:00', quantity: 1 }],
  intervalHours: 8,
}

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
  window.history.replaceState(null, '', `/medications${setupSearch}`)
})
afterEach(() => {
  client.clear()
  vi.restoreAllMocks()
})

type Respond = (
  payload: Record<string, unknown>,
) => Response | undefined | Promise<Response | undefined>

/** The Worker's edit rules in miniature: the successor starts at the Edit time. */
function api(initial: DailySchedule[], respond?: Respond) {
  let schedules = initial
  const edits: Record<string, unknown>[] = []
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [magnesium] })),
    http.get('/api/schedules', () =>
      HttpResponse.json({
        schedules: schedules.filter((item) => !item.replacedAt),
        earlierSchedules: schedules.filter((item) => item.replacedAt),
        records: [],
        today: scheduleToday(schedules, new Date(initialNow), []),
      }),
    ),
    http.post('/api/schedules/edit', async ({ request }) => {
      const payload = (await request.json()) as Record<string, unknown>
      edits.push(payload)
      const response = await respond?.(payload)
      if (response) return response
      const parent = schedules.find((item) => item.id === payload.basedOnId) as DailySchedule
      const interval = payload.intervalHours != null
      const version = {
        id: payload.id,
        medicineId: parent.medicineId,
        startDate: interval ? (payload.anchorDate ?? parent.startDate) : '2026-11-09',
        times: payload.times,
        weekdays: interval ? [...ALL_WEEKDAYS] : payload.weekdays,
        endDate: payload.endDate,
        intervalHours: payload.intervalHours,
        confirmedAt: initialNow,
        basedOnId: parent.id,
        replacedAt: null,
      } as DailySchedule
      schedules = [
        ...schedules.map((item) =>
          item.id === parent.id ? { ...item, replacedAt: initialNow } : item,
        ),
        version,
      ]
      return HttpResponse.json({ schedules: [version] })
    }),
  )
  return { edits }
}

function panel(mode: 'setup' | 'detail', onSaved = vi.fn(), justScheduled = false) {
  return (
    <QueryClientProvider client={client}>
      <SchedulePanel
        mode={mode}
        initialMedicineId={magnesium.id}
        initialNow={initialNow}
        onScheduleSaved={onSaved}
        justScheduled={justScheduled}
      />
    </QueryClientProvider>
  )
}

type User = ReturnType<typeof userEvent.setup>

async function openChange() {
  const onSaved = vi.fn()
  const view = render(panel('setup', onSaved))
  await screen.findByRole('button', { name: 'Save changes' })
  return { ...view, user: userEvent.setup(), onSaved }
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const saveChanges = () => button(/^Save changes$/)
const everyRow = () => button(/^Every:/)
const startsRow = () => button(/^Starts:/)
const takeRow = () => button(/^Take:/)
const sheet = (name: string) => screen.findByRole('dialog', { name })
const preview = () => screen.getByRole('region', { name: 'Next 3 doses after 10:00' })
const doseLines = () =>
  within(preview())
    .getAllByRole('listitem')
    .map((item) => item.textContent)

async function sheetClosed(name: string) {
  await waitFor(() => expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument())
}

async function pickPart(user: User, name: string, value: string) {
  await user.click(screen.getByRole('combobox', { name }))
  await user.click(await screen.findByRole('option', { name: value }))
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}

async function addTime(user: User, time: string) {
  const [hour, minute] = time.split(':')
  await user.click(button('Add another time'))
  const row = screen.getAllByRole('combobox', { name: /^Time \d+ hour$/ }).length
  await pickPart(user, `Time ${row} hour`, hour)
  await pickPart(user, `Time ${row} minute`, minute)
}

async function chooseHours(user: User, label: string) {
  await user.click(everyRow())
  const dialog = await sheet('Every')
  await user.click(within(dialog).getByRole('button', { name: label }))
  await user.click(within(dialog).getByRole('button', { name: 'Done' }))
  await sheetClosed('Every')
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

describe('Medication detail', () => {
  function renderDetail(schedules: DailySchedule[], justScheduled = false) {
    window.history.replaceState(null, '', `/medications${detailSearch}`)
    api(schedules)
    render(panel('detail', vi.fn(), justScheduled))
  }

  test('767·A1 offers Change schedule under the schedule card', async () => {
    renderDetail([clockVersion])
    const change = await screen.findByRole('link', { name: 'Change schedule' })
    expect(change).toHaveAttribute('href', `/medications${setupSearch}#schedule-heading`)
    expect(screen.getByText('Started Mon 2 Nov')).toBeVisible()
    expect(screen.getByText("Details can't be changed here yet.")).toBeVisible()
  })

  test('767·S3 a changed Clock schedule reads Changed, with the next dose after saving', async () => {
    const changed: DailySchedule = {
      ...clockVersion,
      id: '00000000-0000-4000-8000-0000000000a2',
      startDate: '2026-11-09',
      times: [...clockVersion.times, { time: '14:00', quantity: 1 }],
      confirmedAt: initialNow,
      basedOnId: clockVersion.id,
    }
    renderDetail([{ ...clockVersion, replacedAt: initialNow }, changed], true)
    const saved = await screen.findByRole('status', { name: 'Saved schedule' })
    expect(saved).toHaveTextContent('Schedule saved for Magnesium.')
    expect(saved).toHaveTextContent('Next dose: today at 14:00.')
    expect(screen.getByText('Changed Mon 9 Nov')).toBeVisible()
    // Only the current Schedule version is shown.
    expect(screen.getAllByText('08:00')).toHaveLength(1)
    expect(screen.getByText('14:00')).toBeVisible()
  })
})

describe('changing a Clock schedule', () => {
  test('a time-only change explicitly sends and confirms the current Last day', async () => {
    const { edits } = api([{ ...clockVersion, endDate: '2026-11-10' }])
    const { user, onSaved } = await openChange()
    await addTime(user, '14:00')
    await user.click(saveChanges())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(edits[0].endDate).toBe('2026-11-10')
  })

  test('767·A2 opens prefilled without a Start date, and Save changes waits for a change', async () => {
    api([clockVersion])
    await openChange()
    expect(screen.getByText('Change schedule')).toBeVisible()
    expect(button('Set times')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toHaveTextContent('08')
    expect(screen.getByRole('combobox', { name: 'Time 2 hour' })).toHaveTextContent('20')
    expect(screen.queryByText('Start date')).not.toBeInTheDocument()
    expect(saveChanges()).toBeDisabled()
    expect(doseLines()).toEqual(['20:00Today', '08:00Tue 10 Nov', '20:00Tue 10 Nov'])
    expect(
      screen.getByText(
        "Changes start when you save. Doses before then, and any you've logged, stay as they are.",
      ),
    ).toBeVisible()
  })

  test('767·A3, S1 previews the change, saves it as an edit, and confirms only from the server', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const { edits } = api([clockVersion], async () => {
      await held
      return undefined
    })
    const { user, onSaved } = await openChange()
    await addTime(user, '14:00')
    expect(doseLines()).toEqual(['14:00Today', '20:00Today', '08:00Tue 10 Nov'])
    expect(saveChanges()).toBeEnabled()
    await user.click(saveChanges())
    expect(await screen.findByRole('button', { name: 'Saving changes...' })).toBeDisabled()
    expect(button('Every few hours')).toBeDisabled()
    expect(onSaved).not.toHaveBeenCalled()
    release()
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(magnesium))
    expect(edits).toEqual([
      {
        id: expect.any(String),
        basedOnId: clockVersion.id,
        endDate: null,
        weekdays: [...ALL_WEEKDAYS],
        times: [
          { time: '08:00', quantity: 1 },
          { time: '20:00', quantity: 1 },
          { time: '14:00', quantity: 1 },
        ],
        intervalHours: null,
      },
    ])
  })

  test('767·A9 switching to Every few hours and back carries the quantity over', async () => {
    api([{ ...intervalVersion, times: [{ time: '08:00', quantity: 1.5 }] }])
    const { user } = await openChange()
    expect(saveChanges()).toBeDisabled()
    await user.click(button('Set times'))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toHaveTextContent('HH'),
    )
    expect(screen.queryByRole('combobox', { name: 'Time 2 hour' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Quantity for time 1')).toHaveValue('1½')
    expect(screen.getByText('Every day')).toBeVisible()
    expect(saveChanges()).toBeEnabled()
  })
})

describe('changing an Interval schedule', () => {
  test('767·A4, A5 keeps the Anchor when only the hours change', async () => {
    const { edits } = api([intervalVersion])
    const { user, onSaved } = await openChange()
    expect(button('Every few hours')).toHaveAttribute('aria-pressed', 'true')
    expect(everyRow()).toHaveAccessibleName('Every: 8 hours')
    expect(startsRow()).toHaveAccessibleName('Starts: Mon 2 Nov, 08:00')
    expect(takeRow()).toHaveAccessibleName('Take: 1 tablet')
    expect(saveChanges()).toBeDisabled()
    await chooseHours(user, '6 hours')
    expect(doseLines()).toEqual(['14:00Today', '20:00Today', '02:00Tue 10 Nov'])
    await user.click(saveChanges())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(edits[0]).toEqual({
      id: expect.any(String),
      basedOnId: intervalVersion.id,
      endDate: null,
      weekdays: [...ALL_WEEKDAYS],
      times: [{ time: '08:00', quantity: 1 }],
      intervalHours: 6,
    })
  })

  test('767·A6 to A8 switching from set times asks for a new Anchor', async () => {
    const { edits } = api([clockVersion])
    const { user, onSaved } = await openChange()
    await user.click(button('Every few hours'))
    await waitFor(() => expect(everyRow()).toHaveAccessibleName('Every: Choose'))
    expect(startsRow()).toHaveAccessibleName('Starts: Choose')
    expect(takeRow()).toHaveAccessibleName('Take: 1 tablet')
    await chooseHours(user, '8 hours')
    await user.click(saveChanges())
    expect(await screen.findByText('Choose a time.')).toBeVisible()
    expect(startsRow()).toHaveFocus()
    expect(edits).toEqual([])
    await chooseFirstTime(user, '12:00')
    expect(doseLines()).toEqual(['12:00Today', '20:00Today', '04:00Tue 10 Nov'])
    await user.click(saveChanges())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(edits[0]).toMatchObject({
      times: [{ time: '12:00', quantity: 1 }],
      intervalHours: 8,
      anchorDate: '2026-11-09',
    })
  })

  test('a new first time on a past Anchor needs today or a later date', async () => {
    const { edits } = api([intervalVersion])
    const { user } = await openChange()
    await user.click(startsRow())
    const dialog = await sheet('Starts')
    await pickPart(user, 'First time hour', '09')
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(await within(dialog).findByText('Choose today or a later date.')).toBeVisible()
    expect(edits).toEqual([])
  })
})

describe('recovery', () => {
  test('a response with a different Last day leaves the change unconfirmed', async () => {
    api([clockVersion], (payload) =>
      HttpResponse.json({
        schedules: [
          {
            ...clockVersion,
            ...payload,
            startDate: '2026-11-09',
            endDate: '2026-11-10',
            confirmedAt: initialNow,
          },
        ],
      }),
    )
    const { user, onSaved } = await openChange()
    await addTime(user, '14:00')
    await user.click(saveChanges())
    expect(await screen.findByText('That might not have saved.')).toBeVisible()
    expect(onSaved).not.toHaveBeenCalled()
  })

  test('767·S2 a stale conflict applies nothing and offers the current schedule', async () => {
    api([clockVersion], () => HttpResponse.json({ error: 'conflict' }, { status: 409 }))
    const { user, onSaved, unmount } = await openChange()
    await addTime(user, '14:00')
    await user.click(saveChanges())
    expect(await screen.findByText('This schedule changed while you were editing.')).toBeVisible()
    expect(
      screen.getByText(
        'Nothing here was saved. Review the current schedule, then make your change again.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    await user.click(button('Review current schedule'))
    expect(window.location.search).toBe(detailSearch)
    expect(onSaved).not.toHaveBeenCalled()
    unmount()
    window.history.replaceState(null, '', `/medications${setupSearch}`)
    await openChange()
    expect(screen.queryByText('This schedule changed while you were editing.')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Time 3 hour' })).not.toBeInTheDocument()
  })

  test('a lost response keeps the change for a retry of the same request', async () => {
    let fail = true
    const { edits } = api([clockVersion], () =>
      fail ? new HttpResponse(null, { status: 503 }) : undefined,
    )
    const { user, onSaved } = await openChange()
    await addTime(user, '14:00')
    await user.click(saveChanges())
    expect(await screen.findByText('That might not have saved.')).toBeVisible()
    expect(
      screen.getByText('Your changes are still here, and trying again saves them only once.'),
    ).toBeVisible()
    fail = false
    await user.click(button('Try saving changes again'))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(edits).toHaveLength(2)
    expect(edits[1]).toEqual(edits[0])
  })

  test('Cancel after a change asks before discarding, and the Session draft survives leaving', async () => {
    api([clockVersion])
    const { user, unmount } = await openChange()
    await addTime(user, '14:00')
    unmount()
    await openChange()
    expect(screen.getByRole('combobox', { name: 'Time 3 hour' })).toHaveTextContent('14')
    expect(saveChanges()).toBeEnabled()
    await user.click(button('Cancel'))
    const dialog = await sheet('Discard these changes?')
    expect(within(dialog).getByText('Your schedule stays as it is.')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }))
    expect(window.location.search).toBe(detailSearch)
  })

  test('Cancel with no change leaves at once', async () => {
    api([clockVersion])
    const { user } = await openChange()
    await user.click(button('Cancel'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.location.search).toBe(detailSearch)
  })
})

describe('the Last day', () => {
  const lastDayField = () => button(/^Last day, /)
  const lastDayRow = () => button(/^Last day:/)
  const toTuesday = (version: DailySchedule): DailySchedule => ({
    ...version,
    endDate: '2026-11-10',
  })

  async function pickLastDay(user: User, date: string) {
    await user.click(lastDayField())
    const calendar = await screen.findByRole('dialog', { name: 'Last day' })
    await user.click(calendar.querySelector(`button[data-day="${date}"]`)!)
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Last day' })).not.toBeInTheDocument(),
    )
  }

  test('779·A7, A8 set times prefills it, and moving it saves with a shorter preview', async () => {
    const { edits } = api([toTuesday(clockVersion)])
    const { user, onSaved } = await openChange()
    expect(lastDayField()).toHaveAccessibleName(/Tue 10 Nov$/)
    expect(preview()).toHaveTextContent('No doses after Tue 10 Nov.')
    expect(doseLines()).toEqual(['20:00Today', '08:00Tue 10 Nov', '20:00Tue 10 Nov'])
    expect(saveChanges()).toBeDisabled()
    await pickLastDay(user, '2026-11-09')
    const shorter = screen.getByRole('region', { name: 'Next dose after 10:00' })
    expect(
      within(shorter)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['20:00Today'])
    expect(shorter).toHaveTextContent('No doses after Mon 9 Nov.')
    await user.click(saveChanges())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(edits[0]).toMatchObject({ endDate: '2026-11-09', times: clockVersion.times })
  })

  test('779·A9 set times removes it, and moving it back disables Save changes again', async () => {
    const { edits } = api([toTuesday(clockVersion)])
    const { user, onSaved } = await openChange()
    await user.click(button('Remove last day'))
    expect(lastDayField()).toHaveAccessibleName('Last day, not set')
    expect(screen.queryByText(/^No doses after/)).not.toBeInTheDocument()
    expect(saveChanges()).toBeEnabled()
    await pickLastDay(user, '2026-11-10')
    expect(saveChanges()).toBeDisabled()
    await user.click(button('Remove last day'))
    await user.click(saveChanges())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(edits[0].endDate).toBeNull()
  })

  test('779·A10 to A12 every few hours prefills the row and No last day removes it', async () => {
    const { edits } = api([toTuesday(intervalVersion)])
    const { user, onSaved } = await openChange()
    expect(lastDayRow()).toHaveAccessibleName('Last day: Tue 10 Nov')
    expect(preview()).toHaveTextContent('No doses after Tue 10 Nov.')
    expect(saveChanges()).toBeDisabled()
    await user.click(lastDayRow())
    const dialog = await sheet('Last day')
    await user.click(within(dialog).getByRole('button', { name: 'No last day' }))
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await sheetClosed('Last day')
    expect(lastDayRow()).toHaveAccessibleName('Last day: None')
    await user.click(saveChanges())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(edits[0]).toMatchObject({ endDate: null, intervalHours: 8 })
    expect(edits[0]).not.toHaveProperty('anchorDate')
  })

  test('a moved Last day survives leaving as a Session draft and retries unchanged', async () => {
    let fail = true
    const { edits } = api([toTuesday(clockVersion)], () =>
      fail ? new HttpResponse(null, { status: 503 }) : undefined,
    )
    const first = await openChange()
    await pickLastDay(first.user, '2026-11-09')
    first.unmount()
    const { user, onSaved } = await openChange()
    expect(lastDayField()).toHaveAccessibleName(/Mon 9 Nov$/)
    await user.click(saveChanges())
    expect(await screen.findByText('That might not have saved.')).toBeVisible()
    fail = false
    await user.click(button('Try saving changes again'))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(edits).toHaveLength(2)
    expect(edits[1]).toEqual(edits[0])
    expect(edits[0].endDate).toBe('2026-11-09')
  })

  test('779·A18, A19 an Ended schedule needs a later Last day before it restarts', async () => {
    const { edits } = api([{ ...clockVersion, endDate: '2026-11-03' }])
    const { user, onSaved } = await openChange()
    expect(lastDayField()).toHaveAccessibleName(/Tue 3 Nov$/)
    expect(screen.getByRole('region', { name: 'Next doses' })).toHaveTextContent(
      'No doses after Tue 3 Nov.',
    )
    await addTime(user, '14:00')
    await user.click(saveChanges())
    expect(await screen.findByText('Choose today or a later date.')).toBeVisible()
    expect(lastDayField()).toHaveFocus()
    expect(edits).toEqual([])
    await user.click(button('Remove last day'))
    await user.click(saveChanges())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(edits[0]).toMatchObject({ endDate: null })
  })
})

describe('Medication detail with a Last day', () => {
  function renderDetail(schedules: DailySchedule[], justScheduled = false) {
    window.history.replaceState(null, '', `/medications${detailSearch}`)
    api(schedules)
    render(panel('detail', vi.fn(), justScheduled))
  }

  test('779·A13 a running Clock schedule shows its Last day under Started', async () => {
    renderDetail([{ ...clockVersion, endDate: '2026-11-10' }])
    expect(await screen.findByText('Started Mon 2 Nov')).toBeVisible()
    expect(screen.getByText('Last day Tue 10 Nov')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Change schedule' })).toBeVisible()
  })

  test('779·A14 an Interval schedule lists only the doses up to its Last day', async () => {
    renderDetail([{ ...intervalVersion, endDate: '2026-11-09' }])
    expect(await screen.findByText('Next dose')).toBeVisible()
    expect(screen.getByText('16:00')).toBeVisible()
    expect(screen.queryByText('00:00')).not.toBeInTheDocument()
    expect(screen.getByText('Last day Mon 9 Nov')).toBeVisible()
  })

  test('779·A17 an Ended schedule keeps its times with one Ended line and Change schedule', async () => {
    renderDetail([{ ...clockVersion, endDate: '2026-11-03' }])
    expect(await screen.findByText('Ended Tue 3 Nov')).toBeVisible()
    expect(screen.getByText('08:00')).toBeVisible()
    expect(screen.queryByText(/^Started/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Last day/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change schedule' })).toBeVisible()
  })

  test('779·A17 an Ended Interval schedule lists no next doses', async () => {
    renderDetail([{ ...intervalVersion, endDate: '2026-11-03' }])
    expect(await screen.findByText('Ended Tue 3 Nov')).toBeVisible()
    expect(screen.queryByText(/^Next/)).not.toBeInTheDocument()
    expect(screen.getByText('1 tablet each time')).toBeVisible()
  })

  test('779·A19 a restarted schedule reads Changed with its next dose', async () => {
    const restarted: DailySchedule = {
      ...clockVersion,
      id: '00000000-0000-4000-8000-0000000000a2',
      startDate: '2026-11-09',
      confirmedAt: initialNow,
      basedOnId: clockVersion.id,
    }
    renderDetail(
      [{ ...clockVersion, endDate: '2026-11-03', replacedAt: initialNow }, restarted],
      true,
    )
    const saved = await screen.findByRole('status', { name: 'Saved schedule' })
    expect(saved).toHaveTextContent('Next dose: today at 20:00.')
    expect(screen.getByText('Changed Mon 9 Nov')).toBeVisible()
    expect(screen.queryByText(/^Ended/)).not.toBeInTheDocument()
  })
})
