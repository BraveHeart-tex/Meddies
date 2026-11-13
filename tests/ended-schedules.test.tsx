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
const medicine = (n: number, label: string): Medicine => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  label,
  strength: null,
  unit: 'tablet',
})
const magnesium = medicine(1, 'Magnesium')
const iron = medicine(2, 'Iron')
const omega = medicine(3, 'Omega 3')
const zinc = medicine(4, 'Zinc')
const vitaminD = medicine(5, 'Vitamin D')

const version = (n: number, medicineId: string, extra: Partial<DailySchedule> = {}) =>
  ({
    id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    medicineId,
    startDate: '2026-11-02',
    times: [
      { time: '08:00', quantity: 1 },
      { time: '20:00', quantity: 1 },
    ],
    weekdays: [...ALL_WEEKDAYS],
    endDate: null,
    intervalHours: null,
    confirmedAt: '2026-11-01T18:00:00.000Z',
    ...extra,
  }) as DailySchedule

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
  window.history.replaceState(null, '', '/medications')
})
afterEach(() => client.clear())

type Respond = (
  payload: Record<string, unknown>,
) => Response | undefined | Promise<Response | undefined>

/** The Worker's stop rules in miniature: the successor is stopped at its Edit time. */
function api(medicines: Medicine[], initial: DailySchedule[], respond?: Respond) {
  let schedules = initial
  const stops: Record<string, unknown>[] = []
  server.use(
    http.post('/api/schedules/stop', async ({ request }) => {
      const payload = (await request.json()) as Record<string, unknown>
      stops.push(payload)
      const response = await respond?.(payload)
      if (response) return response
      const parent = schedules.find((item) => item.id === payload.basedOnId) as DailySchedule
      const stopped: DailySchedule = {
        ...parent,
        id: payload.id as string,
        endDate: null,
        confirmedAt: initialNow,
        basedOnId: parent.id,
        stoppedAt: initialNow,
        replacedAt: null,
      }
      schedules = [
        ...schedules.map((item) =>
          item.id === parent.id ? { ...item, replacedAt: initialNow } : item,
        ),
        stopped,
      ]
      return HttpResponse.json({ schedules: [stopped] })
    }),
    http.get('/api/medicines', () => HttpResponse.json({ medicines })),
    http.get('/api/schedules', () =>
      HttpResponse.json({
        schedules: schedules.filter((item) => !item.replacedAt),
        earlierSchedules: schedules.filter((item) => item.replacedAt),
        records: [],
        today: scheduleToday(schedules, new Date(initialNow), []),
      }),
    ),
  )
  return { stops }
}

function renderPanel(mode: 'list' | 'detail' | 'setup' | 'today') {
  return render(
    <QueryClientProvider client={client}>
      <SchedulePanel mode={mode} initialMedicineId={magnesium.id} initialNow={initialNow} />
    </QueryClientProvider>,
  )
}
const renderList = () => renderPanel('list')

const rows = (group: string) =>
  within(screen.getByRole('region', { name: group }))
    .getAllByRole('listitem')
    .map((item) => item.textContent)

test('227·A20 Ended schedules sit in their own group below the others', async () => {
  api(
    [magnesium, iron, omega, zinc, vitaminD],
    [
      // Runs through its Last day today.
      version(1, magnesium.id, { endDate: '2026-11-09' }),
      // Every 7 hours from Tue 3 Nov at 22:00: next at 11:00 today.
      version(2, iron.id, {
        startDate: '2026-11-03',
        times: [{ time: '22:00', quantity: 1 }],
        intervalHours: 7,
      }),
      version(4, zinc.id, { endDate: '2026-11-03' }),
      // Stopped at 09:00 today.
      version(5, vitaminD.id, { stoppedAt: '2026-11-09T06:00:00.000Z' }),
    ],
  )
  renderList()
  expect(await screen.findByRole('region', { name: 'Ended' })).toBeVisible()
  const groups = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))
  expect(groups.filter(Boolean)).toEqual(['On a schedule', 'No schedule', 'Ended'])
  expect(rows('On a schedule').join('|')).toMatch(/Magnesium.*Every day · 08:00, 20:00/)
  expect(rows('On a schedule').join('|')).toMatch(/Iron.*Every 7 hours · Next at 11:00/)
  expect(rows('No schedule').join('|')).toMatch(/Omega 3/)
  expect(rows('Ended')).toEqual([
    expect.stringMatching(/Zinc.*Ended Tue 3 Nov/),
    expect.stringMatching(/Vitamin D.*Ended Mon 9 Nov/),
  ])
})

test('227·A20 an Interval row never shows a next dose after its Last day', async () => {
  // Every 24 hours at 09:00: today's has passed and tomorrow's is after the Last day.
  api(
    [iron],
    [
      version(2, iron.id, {
        times: [{ time: '09:00', quantity: 1 }],
        intervalHours: 24,
        endDate: '2026-11-09',
      }),
    ],
  )
  renderList()
  expect(await screen.findByRole('region', { name: 'On a schedule' })).toBeVisible()
  expect(rows('On a schedule')).toEqual([expect.stringMatching(/Iron.*Every 24 hours/)])
  expect(rows('On a schedule')[0]).not.toMatch(/Next/)
})

describe('Stop schedule', () => {
  const running = version(1, magnesium.id, { endDate: '2026-11-10' })
  const button = (name: string | RegExp) => screen.getByRole('button', { name })
  const drawer = () => screen.findByRole('dialog', { name: 'Stop this schedule?' })
  const drawerClosed = () =>
    waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Stop this schedule?' })).not.toBeInTheDocument(),
    )

  async function openDetail(schedules: DailySchedule[], respond?: Respond) {
    window.history.replaceState(null, '', `/medications?medicine=${magnesium.id}`)
    const { stops } = api([magnesium], schedules, respond)
    const view = renderPanel('detail')
    await screen.findByRole('link', { name: 'Change schedule' })
    return { ...view, stops, user: userEvent.setup() }
  }

  test('227·A13, A14 sits beside Change schedule on a running or not-yet-started schedule', async () => {
    await openDetail([version(1, magnesium.id, { startDate: '2026-11-12' })])
    const stop = button('Stop schedule')
    expect(stop.parentElement).toContainElement(
      screen.getByRole('link', { name: 'Change schedule' }),
    )
  })

  test('227·A17 is hidden on an Ended schedule', async () => {
    await openDetail([version(1, magnesium.id, { endDate: '2026-11-03' })])
    expect(screen.queryByRole('button', { name: 'Stop schedule' })).not.toBeInTheDocument()
  })

  test('227·A15 the confirm step saves nothing, and Keep schedule or Escape dismiss it', async () => {
    const { user, stops } = await openDetail([running])
    await user.click(button('Stop schedule'))
    const dialog = await drawer()
    expect(
      within(dialog).getByText("Doses due so far, and any you've logged, stay as they are."),
    ).toBeVisible()
    expect(
      within(dialog).getByText("Meddies won't expect any more doses of Magnesium."),
    ).toBeVisible()
    expect(within(dialog).getByText('To start again, use Change schedule.')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Keep schedule' }))
    await drawerClosed()
    expect(button('Stop schedule')).toHaveFocus()
    await user.click(button('Stop schedule'))
    await drawer()
    await user.keyboard('{Escape}')
    await drawerClosed()
    expect(stops).toEqual([])
  })

  test('227·S1, A16 holds while stopping, then reads Ended today with only Change schedule', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const { user, stops } = await openDetail([running], async () => {
      await held
      return undefined
    })
    await user.click(button('Stop schedule'))
    const dialog = await drawer()
    await user.click(within(dialog).getByRole('button', { name: 'Stop schedule' }))
    expect(await within(dialog).findByRole('button', { name: 'Stopping…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Keep schedule' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Stop this schedule?' })).toBeVisible()
    release()
    await drawerClosed()
    const alert = await screen.findByRole('status', { name: 'Stopped schedule' })
    expect(alert).toHaveTextContent('Schedule stopped for Magnesium.')
    expect(alert).toHaveTextContent('No more doses after 10:00 today.')
    expect(screen.getByText('Ended Mon 9 Nov')).toBeVisible()
    expect(screen.queryByText(/^Last day/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop schedule' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change schedule' })).toHaveFocus()
    expect(stops).toEqual([{ id: expect.any(String), basedOnId: running.id }])
  })

  test('227·S2 an unknown result offers Retry of the same stop', async () => {
    let fail = true
    const { user, stops } = await openDetail([running], () =>
      fail ? new HttpResponse(null, { status: 503 }) : undefined,
    )
    await user.click(button('Stop schedule'))
    const dialog = await drawer()
    await user.click(within(dialog).getByRole('button', { name: 'Stop schedule' }))
    expect(
      await within(dialog).findByText(
        'That might not have saved. Check your connection and try again.',
      ),
    ).toBeVisible()
    fail = false
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('status', { name: 'Stopped schedule' })).toBeVisible()
    expect(stops).toHaveLength(2)
    expect(stops[1]).toEqual(stops[0])
  })

  test('a stale stop shows the 215·S2 recovery and saves nothing', async () => {
    const { user } = await openDetail([running], () =>
      HttpResponse.json({ error: 'conflict' }, { status: 409 }),
    )
    await user.click(button('Stop schedule'))
    const dialog = await drawer()
    await user.click(within(dialog).getByRole('button', { name: 'Stop schedule' }))
    expect(
      await within(dialog).findByText('This schedule changed while you were editing.'),
    ).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Review current schedule' }))
    await drawerClosed()
    expect(screen.queryByRole('status', { name: 'Stopped schedule' })).not.toBeInTheDocument()
    expect(screen.getByText('Last day Tue 10 Nov')).toBeVisible()
  })

  test('227·A20 a stopped schedule sits in the Ended group on its stop day', async () => {
    const { user, unmount } = await openDetail([running])
    await user.click(button('Stop schedule'))
    await user.click(within(await drawer()).getByRole('button', { name: 'Stop schedule' }))
    await screen.findByRole('status', { name: 'Stopped schedule' })
    unmount()
    renderList()
    expect(await screen.findByRole('region', { name: 'Ended' })).toBeVisible()
    expect(rows('Ended')).toEqual([expect.stringMatching(/Magnesium.*Ended Mon 9 Nov/)])
  })

  test('Change schedule on a stopped schedule opens with no Last day and can restart it', async () => {
    window.history.replaceState(null, '', `/medications?schedule=${magnesium.id}`)
    api([magnesium], [version(1, magnesium.id, { stoppedAt: initialNow, basedOnId: running.id })])
    renderPanel('setup')
    const save = await screen.findByRole('button', { name: 'Save changes' })
    expect(screen.getByRole('button', { name: /^Last day, / })).toHaveAccessibleName(
      'Last day, not set',
    )
    expect(save).toBeEnabled()
  })

  test('Today shows no dose after the stop and no setup nudge', async () => {
    api([magnesium], [version(1, magnesium.id, { stoppedAt: initialNow })])
    renderPanel('today')
    await waitFor(() =>
      expect(document.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument(),
    )
    expect(screen.queryByText('20:00')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Set schedule' })).not.toBeInTheDocument()
  })
})
