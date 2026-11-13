import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import type { NextRouter } from 'next/router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import { MedicationsScreen } from '../src/features/medicines/medications-screen'
import type { DailySchedule } from '../src/features/schedules/contract'
import { scheduleToday } from '../src/features/schedules/occurrences'
import { resumeDraftKey } from '../src/features/schedules/schedule-resume-screen'
import { ALL_WEEKDAYS } from '../src/features/schedules/weekdays'
import { writeSessionDraft } from '../src/lib/session-drafts'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/medications',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

// 10:00 on Monday 9 November in Istanbul.
const initialNow = '2026-11-09T07:00:00.000Z'
const magnesium: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Magnesium',
  strength: null,
  unit: 'tablet',
}
const detailUrl = `/medications?medicine=${magnesium.id}`
const resumeUrl = `/medications?resume=${magnesium.id}`

const version = (n: number, extra: Partial<DailySchedule> = {}) =>
  ({
    id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    medicineId: magnesium.id,
    startDate: '2026-11-02',
    times: [
      { time: '08:00', quantity: 1 },
      { time: '20:00', quantity: 1 },
    ],
    weekdays: [...ALL_WEEKDAYS],
    endDate: '2026-11-10',
    intervalHours: null,
    confirmedAt: '2026-11-01T18:00:00.000Z',
    ...extra,
  }) as DailySchedule
const paused = (extra: Partial<DailySchedule> = {}) =>
  version(2, {
    basedOnId: version(1).id,
    confirmedAt: '2026-11-07T07:00:00.000Z',
    pausedAt: '2026-11-07T07:00:00.000Z',
    ...extra,
  })
const clockPaused = paused()
const intervalPaused = paused({ times: [{ time: '08:00', quantity: 1 }], intervalHours: 8 })

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
  window.history.replaceState(null, '', detailUrl)
  // jsdom has no layout; Medications views scroll to their heading.
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  client.clear()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

type Respond = (
  payload: Record<string, unknown>,
) => Response | undefined | Promise<Response | undefined>

/** The Worker's resume rules in miniature: running again, from a new Anchor for an Interval. */
function api(initial: DailySchedule[], respond?: Respond) {
  let schedules = initial
  const saves: Record<string, unknown>[] = []
  server.use(
    http.post('/api/schedules/resume', async ({ request }) => {
      const payload = (await request.json()) as Record<string, unknown>
      saves.push(payload)
      const response = await respond?.(payload)
      if (response) return response
      const parent = schedules.find((item) => item.id === payload.basedOnId) as DailySchedule
      const saved: DailySchedule = {
        ...parent,
        id: payload.id as string,
        confirmedAt: initialNow,
        basedOnId: parent.id,
        pausedAt: null,
        stoppedAt: null,
        replacedAt: null,
        ...(payload.anchorDate
          ? {
              anchorDate: payload.anchorDate as string,
              times: [{ ...parent.times[0], time: payload.anchorTime as string }],
            }
          : {}),
      }
      schedules = [
        ...schedules.map((item) =>
          item.id === parent.id ? { ...item, replacedAt: initialNow } : item,
        ),
        saved,
      ]
      return HttpResponse.json({ schedules: [saved] })
    }),
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [magnesium] })),
    http.get('/api/schedules', () =>
      HttpResponse.json({
        schedules: schedules.filter((item) => !item.replacedAt),
        earlierSchedules: schedules.filter((item) => item.replacedAt),
        records: [],
        today: scheduleToday(schedules, new Date(initialNow), []),
      }),
    ),
  )
  return { saves }
}

const router = { prefetch: async () => {} } as unknown as NextRouter
// A new element each time: the mocked search params only update when the screen re-renders.
const screenAt = () => (
  <RouterContext.Provider value={router}>
    <QueryClientProvider client={client}>
      <MedicationsScreen initialNow={initialNow} />
    </QueryClientProvider>
  </RouterContext.Provider>
)

type User = ReturnType<typeof userEvent.setup>
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const resumeButton = () => screen.getByRole('button', { name: 'Resume' })
const startsRow = () => button(/^Starts:/)
const sheet = (name: string) => screen.findByRole('dialog', { name })
const sheetClosed = (name: string) =>
  waitFor(() => expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument())
const doseLines = (region: string) =>
  within(screen.getByRole('region', { name: region }))
    .getAllByRole('listitem')
    .map((item) => item.textContent)

async function openDetail(schedules: DailySchedule[], respond?: Respond) {
  const { saves } = api(schedules, respond)
  const view = render(screenAt())
  await screen.findByText(/^(Paused since|Ended) /)
  return { ...view, saves, user: userEvent.setup() }
}

async function pickPart(user: User, name: string, value: string) {
  await user.click(screen.getByRole('combobox', { name }))
  await user.click(await screen.findByRole('option', { name: value }))
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}

async function chooseStarts(user: User, day: 'Today' | 'Tomorrow', time: string) {
  const [hour, minute] = time.split(':')
  await user.click(startsRow())
  const dialog = await sheet('Starts')
  await user.click(within(dialog).getByRole('button', { name: day }))
  await pickPart(user, 'First time hour', hour)
  await pickPart(user, 'First time minute', minute)
  await user.click(within(dialog).getByRole('button', { name: 'Done' }))
  await sheetClosed('Starts')
}

/** Follows Resume to the Resume schedule screen. */
async function openResume(view: { rerender: (ui: React.ReactElement) => void }, user: User) {
  await user.click(screen.getByRole('link', { name: 'Resume' }))
  expect(window.location.search).toBe(`?resume=${magnesium.id}`)
  view.rerender(screenAt())
  return screen.findByRole('heading', { name: 'Magnesium' })
}

describe('Resume a Clock schedule', () => {
  test('233·A4 Resume replaces Change schedule beside Stop schedule', async () => {
    await openDetail([clockPaused])
    expect(resumeButton().nextElementSibling).toBe(button('Stop schedule'))
    expect(screen.queryByRole('link', { name: 'Change schedule' })).not.toBeInTheDocument()
  })

  test('233·A7 resumes in one tap, names the next dose and gives the actions back', async () => {
    const { user, saves } = await openDetail([clockPaused])
    resumeButton().focus()
    await user.keyboard('{Enter}')
    const alert = await screen.findByRole('status', { name: 'Resumed schedule' })
    expect(alert).toHaveTextContent('Schedule resumed for Magnesium.')
    expect(alert).toHaveTextContent('Next dose: today at 20:00.')
    expect(screen.getByText('Changed Mon 9 Nov')).toBeVisible()
    expect(button('Pause')).toBeVisible()
    expect(button('Stop schedule')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Change schedule' })).toHaveFocus())
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument()
    expect(saves).toEqual([{ id: expect.any(String), basedOnId: clockPaused.id }])
  })

  test('233·A8 on its Last day with no dose left says none are due', async () => {
    const { user } = await openDetail([
      paused({ times: [{ time: '08:00', quantity: 1 }], endDate: '2026-11-09' }),
    ])
    await user.click(resumeButton())
    expect(await screen.findByRole('status', { name: 'Resumed schedule' })).toHaveTextContent(
      'No more doses are due. Today is its Last day.',
    )
  })

  test('#26 a schedule resumed before its start date names its first dose', async () => {
    const { user } = await openDetail([paused({ startDate: '2026-11-10' })])
    await user.click(resumeButton())
    expect(await screen.findByRole('status', { name: 'Resumed schedule' })).toHaveTextContent(
      'Next dose: Tue 10 Nov at 08:00.',
    )
  })

  test('233·S3, S4 holds while resuming; an unknown result offers Retry of the same resume', async () => {
    let release = () => {}
    let held: Promise<void> | null = new Promise<void>((resolve) => (release = resolve))
    const { user, saves } = await openDetail([clockPaused], async () => {
      if (held) {
        await held
        held = null
        return new HttpResponse(null, { status: 503 })
      }
      return undefined
    })
    await user.click(resumeButton())
    expect(await screen.findByRole('button', { name: 'Resuming…' })).toBeDisabled()
    expect(button('Stop schedule')).toBeDisabled()
    release()
    expect(
      await screen.findByText('That might not have saved. Check your connection and try again.'),
    ).toBeVisible()
    const retry = button('Retry')
    expect(retry).toHaveAccessibleDescription(/might not have saved/)
    expect(button('Stop schedule')).toBeEnabled()
    await user.click(retry)
    expect(await screen.findByRole('status', { name: 'Resumed schedule' })).toBeVisible()
    expect(saves).toHaveLength(2)
    expect(saves[1]).toEqual(saves[0])
  })

  test('a stale resume shows the 215·S2 recovery', async () => {
    const { user } = await openDetail([clockPaused], () =>
      HttpResponse.json({ error: 'conflict' }, { status: 409 }),
    )
    await user.click(resumeButton())
    expect(await screen.findByText('This schedule changed while you were editing.')).toBeVisible()
    await user.click(button('Review current schedule'))
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeVisible()
    expect(
      screen.queryByText('This schedule changed while you were editing.'),
    ).not.toBeInTheDocument()
  })

  test('known offline: Resume is disabled with Connect to save', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { saves } = await openDetail([clockPaused])
    const save = button('Connect to save')
    expect(save).toBeDisabled()
    expect(save).toHaveAccessibleDescription(/offline/i)
    expect(saves).toEqual([])
  })

  test.each([
    ['Ended', paused({ stoppedAt: '2026-11-08T07:00:00.000Z' })],
    ['past its Last day while paused', paused({ endDate: '2026-11-08' })],
  ])('233·A5 Resume is hidden on a schedule %s', async (_, schedule) => {
    await openDetail([schedule])
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change schedule' })).toBeVisible()
  })
})

describe('Resume an Interval schedule', () => {
  test('233·A9 Resume opens the Resume schedule screen; Cancel goes back', async () => {
    const view = await openDetail([intervalPaused])
    const { user } = view
    await openResume(view, user)
    expect(screen.getByText('Resume schedule', { selector: 'p' })).toBeVisible()
    expect(
      screen.getByText(
        'Every 8 hours, 1 tablet each time. Last day Tue 10 Nov. Choose when doses start again.',
      ),
    ).toBeVisible()
    expect(startsRow()).toHaveAccessibleName('Starts: Choose')
    expect(screen.getByText("They'll show here.")).toBeVisible()
    expect(button('Resume schedule')).toBeVisible()
    await user.click(button('Cancel'))
    expect(window.location.search).toBe(`?medicine=${magnesium.id}`)
  })

  test('233·A10, A13 resumes from the new Anchor and names its next dose', async () => {
    const view = await openDetail([intervalPaused])
    const { user, saves } = view
    await openResume(view, user)
    await chooseStarts(user, 'Today', '14:00')
    expect(startsRow()).toHaveAccessibleName('Starts: Today, 14:00')
    expect(doseLines('Next 3 doses')).toEqual(['14:00Today', '22:00Today', '06:00Tue 10 Nov'])
    await user.click(button('Resume schedule'))
    await waitFor(() => expect(window.location.search).toBe(`?medicine=${magnesium.id}`))
    view.rerender(screenAt())
    const alert = await screen.findByRole('status', { name: 'Resumed schedule' })
    expect(alert).toHaveTextContent('Next dose: today at 14:00.')
    // The running Interval card counts from the new Anchor.
    expect(screen.getByText(/^Starts .* at 14:00$/)).toBeVisible()
    expect(button('Pause')).toBeVisible()
    expect(saves).toEqual([
      {
        id: expect.any(String),
        basedOnId: intervalPaused.id,
        anchorDate: '2026-11-09',
        anchorTime: '14:00',
      },
    ])
  })

  test('233·A12 the Last day cuts the preview short', async () => {
    const view = await openDetail([intervalPaused])
    await openResume(view, view.user)
    await chooseStarts(view.user, 'Tomorrow', '12:00')
    expect(doseLines('Next 2 doses')).toEqual([
      expect.stringMatching(/12:00/),
      expect.stringMatching(/20:00/),
    ])
    expect(screen.getByText('No doses after Tue 10 Nov.')).toBeVisible()
  })

  test('233·A11 an Anchor before today shows the field error after Save', async () => {
    api([intervalPaused])
    writeSessionDraft(client, resumeDraftKey(intervalPaused.id), {
      date: '2026-11-08',
      time: '14:00',
    })
    window.history.replaceState(null, '', resumeUrl)
    render(screenAt())
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'Magnesium' })
    await waitFor(() => expect(startsRow()).toHaveAccessibleName('Starts: Sun 8 Nov, 14:00'))
    await user.click(button('Resume schedule'))
    expect(await screen.findByText('Choose today or a later date.')).toBeVisible()
    expect(startsRow()).toHaveFocus()
  })

  test('233·S5 holds while saving', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const view = await openDetail([intervalPaused], async () => {
      await held
      return undefined
    })
    await openResume(view, view.user)
    await chooseStarts(view.user, 'Today', '14:00')
    await view.user.click(button('Resume schedule'))
    expect(await screen.findByRole('button', { name: 'Resuming…' })).toBeDisabled()
    expect(startsRow()).toBeDisabled()
    release()
    await waitFor(() => expect(window.location.search).toBe(`?medicine=${magnesium.id}`))
  })

  test('a stale resume shows the 215·S2 recovery on the screen', async () => {
    const view = await openDetail([intervalPaused], () =>
      HttpResponse.json({ error: 'conflict' }, { status: 409 }),
    )
    await openResume(view, view.user)
    await chooseStarts(view.user, 'Today', '14:00')
    await view.user.click(button('Resume schedule'))
    expect(await screen.findByText('This schedule changed while you were editing.')).toBeVisible()
    await view.user.click(button('Review current schedule'))
    expect(window.location.search).toBe(`?medicine=${magnesium.id}`)
  })

  test('known offline: Resume and Resume schedule are disabled', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    api([intervalPaused])
    window.history.replaceState(null, '', resumeUrl)
    render(screenAt())
    await screen.findByRole('heading', { name: 'Magnesium' })
    expect(await screen.findByRole('button', { name: 'Connect to save' })).toBeDisabled()
  })

  test('a running schedule has nothing to resume, so the screen returns to detail', async () => {
    api([version(1, { intervalHours: 8, times: [{ time: '08:00', quantity: 1 }] })])
    window.history.replaceState(null, '', resumeUrl)
    render(screenAt())
    await waitFor(() => expect(window.location.search).toBe(`?medicine=${magnesium.id}`))
  })
})
