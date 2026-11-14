import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import type { DailySchedule } from '../src/features/schedules/contract'
import { scheduleToday } from '../src/features/schedules/occurrences'
import { SchedulePanel } from '../src/features/schedules/schedule-panel'
import { ALL_WEEKDAYS } from '../src/features/schedules/weekdays'
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
const running = version(1)
const interval = version(1, { times: [{ time: '08:00', quantity: 2 }], intervalHours: 8 })
const paused = (from: DailySchedule, extra: Partial<DailySchedule> = {}) =>
  version(2, {
    ...from,
    id: version(2).id,
    basedOnId: from.id,
    confirmedAt: initialNow,
    pausedAt: initialNow,
    ...extra,
  })

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
  window.history.replaceState(null, '', `/medications?medicine=${magnesium.id}`)
})
afterEach(() => {
  client.clear()
  vi.restoreAllMocks()
})

type Respond = (
  payload: Record<string, unknown>,
) => Response | undefined | Promise<Response | undefined>

/** The Worker's pause and stop rules in miniature: the successor holds at its Edit time. */
function api(initial: DailySchedule[], respond?: Respond) {
  let schedules = initial
  const saves: Record<string, unknown>[] = []
  const command =
    (field: 'pausedAt' | 'stoppedAt') =>
    async ({ request }: { request: Request }) => {
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
        [field]: initialNow,
        ...(field === 'stoppedAt' ? { endDate: null } : {}),
        replacedAt: null,
      }
      schedules = [
        ...schedules.map((item) =>
          item.id === parent.id ? { ...item, replacedAt: initialNow } : item,
        ),
        saved,
      ]
      return HttpResponse.json({ schedules: [saved] })
    }
  server.use(
    http.post('/api/schedules/pause', command('pausedAt')),
    http.post('/api/schedules/stop', command('stoppedAt')),
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

function renderPanel(mode: 'list' | 'detail' | 'today') {
  return render(
    <QueryClientProvider client={client}>
      <SchedulePanel mode={mode} initialMedicineId={magnesium.id} initialNow={initialNow} />
    </QueryClientProvider>,
  )
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const drawer = () => screen.findByRole('dialog', { name: 'Pause this schedule?' })
const drawerClosed = () =>
  waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Pause this schedule?' })).not.toBeInTheDocument(),
  )
const rows = (group: string) =>
  within(screen.getByRole('region', { name: group }))
    .getAllByRole('listitem')
    .map((item) => item.textContent)

async function openDetail(schedules: DailySchedule[], respond?: Respond) {
  const { saves } = api(schedules, respond)
  const view = renderPanel('detail')
  await screen.findByText(/^(Last day|Ended) /)
  return { ...view, saves, user: userEvent.setup() }
}

async function pause(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button('Pause'))
  await user.click(within(await drawer()).getByRole('button', { name: 'Pause schedule' }))
}

/* eslint-disable meddies/no-cosmetic-class-assertions -- #286: a confirmation's look (default
   Alert, not the dark confirmation block) and a button's emphasis (ghost, never destructive on
   the page) have no accessible signal; the variant class is it. */
function expectDefaultAlertAbove(alert: HTMLElement, action: HTMLElement) {
  expect(alert).toHaveClass('bg-card')
  expect(alert).not.toHaveClass('bg-foreground')
  expect(alert.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
}
const expectGhost = (element: HTMLElement) => {
  expect(element).toHaveClass('hover:bg-muted')
  expect(element).not.toHaveClass('border-border-strong', 'bg-destructive/10')
}

describe('#286 quiet actions and the Paused Badge', () => {
  test('a running schedule puts ghost Pause and Stop schedule under the outline Change schedule', async () => {
    await openDetail([running])
    expect(screen.getByRole('link', { name: 'Change schedule' })).toHaveClass(
      'border-border-strong',
    )
    expectGhost(button('Pause'))
    expectGhost(button('Stop schedule'))
  })

  test('a paused schedule keeps Resume primary beside a ghost Stop schedule', async () => {
    await openDetail([paused(running)])
    expect(button('Resume')).toHaveClass('bg-primary')
    expectGhost(button('Stop schedule'))
  })

  test('the destructive tint appears only on the Stop confirm', async () => {
    const { user } = await openDetail([running])
    await user.click(button('Stop schedule'))
    const dialog = await screen.findByRole('dialog', { name: 'Stop this schedule?' })
    expect(within(dialog).getByRole('button', { name: 'Stop schedule' })).toHaveClass(
      'bg-destructive/10',
    )
  })

  test.each([
    ['Clock', paused(running)],
    ['Interval', paused(interval)],
  ])(
    'a paused %s card shows Paused with the Pause icon and says so in its name',
    async (_, schedule) => {
      await openDetail([schedule])
      const card = screen.getByRole('group', { name: 'Schedule, Paused' })
      const badge = within(card).getByText('Paused', { exact: true })
      expect(badge.querySelector('svg.lucide-pause')).toHaveAttribute('aria-hidden', 'true')
    },
  )

  test.each([
    ['running', running],
    ['not-yet-started', version(1, { startDate: '2026-11-12' })],
    ['Ended', version(1, { endDate: '2026-11-03' })],
  ])('a %s card shows no Paused Badge', async (_, schedule) => {
    await openDetail([schedule])
    expect(screen.getByRole('group', { name: 'Schedule' })).toBeVisible()
    expect(screen.queryByText('Paused', { exact: true })).not.toBeInTheDocument()
  })
})
/* eslint-enable meddies/no-cosmetic-class-assertions */

describe('Pause', () => {
  test('233·A1, A2 sits beside Stop schedule under Change schedule', async () => {
    await openDetail([version(1, { startDate: '2026-11-12' })])
    const pauseButton = button('Pause')
    const change = screen.getByRole('link', { name: 'Change schedule' })
    expect(pauseButton.nextElementSibling).toBe(button('Stop schedule'))
    expect(change.nextElementSibling).toBe(pauseButton)
  })

  test.each([
    ['paused', paused(running)],
    ['Ended', version(1, { endDate: '2026-11-03' })],
  ])('233·A1 is hidden on a %s schedule', async (_, schedule) => {
    await openDetail([schedule])
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  })

  test('233·A3 the confirm step saves nothing, and Keep schedule or Escape dismiss it', async () => {
    const { user, saves } = await openDetail([running])
    await user.click(button('Pause'))
    const dialog = await drawer()
    for (const line of [
      "Doses due so far, and any you've logged, stay as they are.",
      "Meddies won't expect any doses of Magnesium until you resume.",
      'Nothing is added later for the paused days.',
    ])
      expect(within(dialog).getByText(line)).toBeVisible()
    // No refill line until refill alerts exist (#283 F10, #52).
    expect(within(dialog).queryByText(/Refill/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Keep schedule' }))
    await drawerClosed()
    expect(button('Pause')).toHaveFocus()
    await user.keyboard('{Enter}')
    await drawer()
    await user.keyboard('{Escape}')
    await drawerClosed()
    expect(saves).toEqual([])
  })

  test('233·S1, A4 holds while pausing, then reads Paused since with Stop schedule only', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const { user, saves } = await openDetail([running], async () => {
      await held
      return undefined
    })
    await pause(user)
    const dialog = screen.getByRole('dialog', { name: 'Pause this schedule?' })
    expect(await within(dialog).findByRole('button', { name: 'Pausing…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Keep schedule' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(dialog).toBeVisible()
    release()
    await drawerClosed()
    const alert = await screen.findByRole('status', { name: 'Paused schedule' })
    expectDefaultAlertAbove(alert, button('Stop schedule'))
    expect(alert).toHaveTextContent('Schedule paused for Magnesium.')
    expect(alert).toHaveTextContent('No doses expected until you resume.')
    expect(screen.getByText('Paused since Mon 9 Nov')).toBeVisible()
    expect(screen.queryByText(/^(Started|Changed)/)).not.toBeInTheDocument()
    expect(screen.getByText('Last day Tue 10 Nov')).toBeVisible()
    expect(screen.getByText('20:00')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Change schedule' })).not.toBeInTheDocument()
    expect(button('Stop schedule')).toHaveFocus()
    expect(saves).toEqual([{ id: expect.any(String), basedOnId: running.id }])
  })

  test('233·A5 a paused Interval card keeps its interval, quantity and Last day, no next doses', async () => {
    await openDetail([paused(interval)])
    expect(await screen.findByText('Paused since Mon 9 Nov')).toBeVisible()
    expect(screen.getByText('Every 8 hours')).toBeVisible()
    expect(screen.getByText('2 tablets each time')).toBeVisible()
    expect(screen.getByText('Last day Tue 10 Nov')).toBeVisible()
    expect(screen.queryByText(/^Next/)).not.toBeInTheDocument()
  })

  test('233·S2 an unknown result offers Retry of the same pause', async () => {
    let fail = true
    const { user, saves } = await openDetail([running], () =>
      fail ? new HttpResponse(null, { status: 503 }) : undefined,
    )
    await pause(user)
    const dialog = screen.getByRole('dialog', { name: 'Pause this schedule?' })
    expect(
      await within(dialog).findByText(
        'That might not have saved. Check your connection and try again.',
      ),
    ).toBeVisible()
    fail = false
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('status', { name: 'Paused schedule' })).toBeVisible()
    expect(saves).toHaveLength(2)
    expect(saves[1]).toEqual(saves[0])
  })

  test('233·S2 a stale pause shows the 215·S2 recovery and saves nothing', async () => {
    const { user } = await openDetail([running], () =>
      HttpResponse.json({ error: 'conflict' }, { status: 409 }),
    )
    await pause(user)
    const dialog = screen.getByRole('dialog', { name: 'Pause this schedule?' })
    expect(
      await within(dialog).findByText('This schedule changed while you were editing.'),
    ).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Review current schedule' }))
    await drawerClosed()
    expect(screen.queryByRole('status', { name: 'Paused schedule' })).not.toBeInTheDocument()
    expect(button('Pause')).toBeVisible()
  })

  test('233·S2 known offline shows Connect to save, disabled', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { user, saves } = await openDetail([running])
    await user.click(button('Pause'))
    const dialog = await drawer()
    const save = within(dialog).getByRole('button', { name: 'Connect to save' })
    expect(save).toBeDisabled()
    expect(save).toHaveAccessibleDescription(/offline/i)
    expect(saves).toEqual([])
  })

  test('Stop schedule on a paused schedule ends it and focuses Change schedule', async () => {
    const { user } = await openDetail([paused(running)])
    await user.click(button('Stop schedule'))
    const dialog = await screen.findByRole('dialog', { name: 'Stop this schedule?' })
    await user.click(within(dialog).getByRole('button', { name: 'Stop schedule' }))
    const alert = await screen.findByRole('status', { name: 'Stopped schedule' })
    expectDefaultAlertAbove(alert, screen.getByRole('link', { name: 'Change schedule' }))
    expect(screen.getByText('Ended Mon 9 Nov')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Change schedule' })).toHaveFocus())
  })
})

describe('233·A6 Medications and Today', () => {
  test('a paused row stays in On a schedule and reads Paused since', async () => {
    api([paused(running)])
    renderPanel('list')
    expect(await screen.findByRole('region', { name: 'On a schedule' })).toBeVisible()
    expect(rows('On a schedule')).toEqual([
      expect.stringMatching(/Magnesium.*Paused since Mon 9 Nov/),
    ])
    // #286: the Paused Badge, with its icon, and the row link's name say it is paused.
    const link = screen.getByRole('link', { name: 'View details for Magnesium, Paused' })
    const badge = within(link.closest('li')!).getByText('Paused', { exact: true })
    expect(badge.querySelector('svg.lucide-pause')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('region', { name: 'Ended' })).not.toBeInTheDocument()
  })

  test('a paused schedule past its Last day sits in Ended', async () => {
    api([paused(running, { endDate: '2026-11-08' })])
    renderPanel('list')
    expect(await screen.findByRole('region', { name: 'Ended' })).toBeVisible()
    expect(rows('Ended')).toEqual([expect.stringMatching(/Magnesium.*Ended Sun 8 Nov/)])
    expect(screen.getByRole('link', { name: 'View details for Magnesium' })).toBeVisible()
    expect(screen.queryByText('Paused', { exact: true })).not.toBeInTheDocument()
  })

  test('Today shows no dose after the pause and no setup nudge', async () => {
    api([{ ...running, replacedAt: initialNow }, paused(running)])
    renderPanel('today')
    await waitFor(() =>
      expect(document.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument(),
    )
    // Today's 20:00 is after the pause; yesterday's unresolved 20:00 may stay in To log (#275).
    expect(document.querySelector('time[datetime="2026-11-09T17:00:00.000Z"]')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Set schedule' })).not.toBeInTheDocument()
  })
})
