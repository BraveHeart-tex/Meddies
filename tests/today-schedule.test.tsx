import {
  dehydrate,
  HydrationBoundary,
  QueryClientProvider,
  onlineManager,
  type QueryClient,
} from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Toaster } from '../src/components/ui/toast'
import type { Medicine } from '../src/features/medicines/contract'
import { medicineKeys } from '../src/features/medicines/queries'
import type { DailySchedule, DoseOutcomeRecord } from '../src/features/schedules/contract'
import { scheduleToday } from '../src/features/schedules/occurrences'
import { scheduleKeys } from '../src/features/schedules/queries'
import { SchedulePanel } from '../src/features/schedules/schedule-panel'
import { TodayDosesFallback } from '../src/features/schedules/today-doses-fallback'
import { TodayHeader } from '../src/features/schedules/today-header'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}))

const medicine: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Morning Tablet',
  strength: null,
  unit: 'tablet',
}
const scheduleFor = (time: string): DailySchedule => ({
  id: '00000000-0000-4000-8000-0000000000a1',
  medicineId: medicine.id,
  startDate: '2026-11-01',
  times: [{ time, quantity: 1 }],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  confirmedAt: '2026-10-31T09:00:00.000Z',
})
// 08:55 in Istanbul (UTC+3); the dose is due at 09:00.
const initialNow = '2026-11-14T05:55:00.000Z'
const doses = () => screen.findByRole('list', { name: "Today's doses" })

/** Serves the schedules snapshot at the server scheduling time `now`, counting reads. */
function schedulesApi(now: string, schedules = [scheduleFor('09:00')]) {
  let serverNow = now
  let records: DoseOutcomeRecord[] = []
  let reads = 0
  let failures = 0
  let gate: Promise<void> | null = null
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })),
    http.get('/api/schedules', async () => {
      reads++
      // The read sees the records stored when it arrived, however late it answers.
      const seen = records
      if (gate) await gate
      if (failures > 0) {
        failures--
        return HttpResponse.json({ error: 'unavailable' }, { status: 503 })
      }
      return HttpResponse.json({
        schedules,
        records: seen,
        today: scheduleToday(schedules, new Date(serverNow), seen),
      })
    }),
    http.put('/api/schedules', async ({ request }) => {
      const body = (await request.json()) as { scheduleId: string; dueAt: string }
      const record: DoseOutcomeRecord = {
        outcome: 'Skipped',
        scheduleId: body.scheduleId,
        dueAt: body.dueAt,
        recordedAt: serverNow,
      }
      records = [record]
      return HttpResponse.json({ record })
    }),
  )
  return {
    reads: () => reads,
    /** Moves the server scheduling clock. */
    at: (next: string) => (serverNow = next),
    failNext: () => failures++,
    hold: () => {
      let release = () => {}
      gate = new Promise((resolve) => (release = resolve))
      return () => {
        gate = null
        release()
      }
    },
  }
}

let client: QueryClient

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  client = createQueryClient()
  client.setQueryData(medicineKeys.list(), [medicine], { updatedAt: Date.now() })
})

afterEach(() => {
  client.clear()
  onlineManager.setOnline(true)
})

/** Today's client parts as the page composes them: the shell header and the doses section. */
function Today({ now = initialNow }: { now?: string }) {
  return (
    <>
      <TodayHeader initialNow={now} />
      <SchedulePanel mode="today" initialNow={now} />
    </>
  )
}

function renderToday(now = initialNow) {
  render(
    <QueryClientProvider client={client}>
      <Toaster>
        <Today now={now} />
      </Toaster>
    </QueryClientProvider>,
  )
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('freshness', () => {
  test('statuses advance on the scheduling clock with no read on a timer', async () => {
    const api = schedulesApi(initialNow)
    renderToday()
    expect(await doses()).toHaveTextContent('Scheduled')
    expect(api.reads()).toBe(1)
    await advance(6 * 60_000)
    expect(await doses()).toHaveTextContent('Not logged')
    await advance(5 * 60_000)
    expect(api.reads()).toBe(1)
  })

  test('a new day reads its own data instead of carrying the old records over', async () => {
    // 23:58 in Istanbul; today's 09:00 dose has passed.
    const lateNight = '2026-11-14T20:58:00.000Z'
    const api = schedulesApi(lateNight)
    renderToday(lateNight)
    expect(await doses()).toHaveTextContent('Not logged')
    const release = api.hold()
    api.at('2026-11-14T21:00:30.000Z')
    await advance(3 * 60_000)
    await waitFor(() => expect(api.reads()).toBe(2))
    expect(screen.queryByRole('list', { name: "Today's doses" })).not.toBeInTheDocument()
    expect(screen.getByText('Loading today’s doses')).toBeVisible()
    release()
    expect(await doses()).toHaveTextContent('Scheduled')
    expect(screen.getByText('Sunday, 15 November')).toBeVisible()
    expect(api.reads()).toBe(2)
  })
})

describe('with a cached snapshot', () => {
  /** Seeds the session cache with a snapshot read at the server time `now`. */
  function cache(now: string, schedules = [scheduleFor('09:00')]) {
    client.setQueryData(
      scheduleKeys.snapshot(),
      { schedules, records: [], now, date: '2026-11-14' },
      { updatedAt: Date.now() },
    )
  }

  // The page's server read is Today's entry read, so mounting with cached data reads nothing;
  // focus, reconnect and Refresh Today reconcile.
  const focus = () => fireEvent(window, new Event('focus'))

  test('a dose whose medication record is missing falls back to Medication', async () => {
    schedulesApi(initialNow, [scheduleFor('09:00')])
    cache(initialNow)
    client.setQueryData(medicineKeys.list(), [])
    renderToday()
    expect(await doses()).toHaveTextContent('Medication')
    expect(await doses()).not.toHaveTextContent('Medicine')
  })

  test('cached doses stay on screen while one refresh runs', async () => {
    const api = schedulesApi(initialNow, [
      scheduleFor('09:00'),
      { ...scheduleFor('10:00'), id: '00000000-0000-4000-8000-0000000000a2' },
    ])
    cache(initialNow)
    const release = api.hold()
    renderToday()
    expect(await doses()).toHaveTextContent('09:00')
    focus()
    await waitFor(() => expect(api.reads()).toBe(1))
    expect(screen.queryByText('Loading today’s doses')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled()
    release()
    expect(await doses()).toHaveTextContent('10:00')
    expect(screen.getByRole('button', { name: 'Refresh Today' })).toBeEnabled()
    expect(api.reads()).toBe(1)
  })

  test('mounting reads nothing; focus and reconnect each refresh once', async () => {
    const api = schedulesApi(initialNow)
    cache(initialNow)
    renderToday()
    expect(await doses()).toHaveTextContent('Morning Tablet')
    await advance(1_000)
    expect(api.reads()).toBe(0)
    focus()
    await waitFor(() => expect(api.reads()).toBe(1))
    fireEvent(window, new Event('offline'))
    await advance(1_000)
    expect(api.reads()).toBe(1)
    fireEvent(window, new Event('online'))
    await waitFor(() => expect(api.reads()).toBe(2))
    await advance(5 * 60_000)
    expect(api.reads()).toBe(2)
  })

  test('a newer server time re-anchors the statuses', async () => {
    const api = schedulesApi('2026-11-14T06:01:00.000Z')
    cache(initialNow)
    const release = api.hold()
    renderToday()
    expect(await doses()).toHaveTextContent('Scheduled')
    focus()
    release()
    await waitFor(() =>
      expect(screen.getByRole('list', { name: "Today's doses" })).toHaveTextContent('Not logged'),
    )
    expect(api.reads()).toBe(1)
  })

  test('a failed refresh keeps the doses, and retry recovers', async () => {
    const api = schedulesApi(initialNow)
    api.failNext()
    cache(initialNow)
    const user = renderToday()
    focus()
    expect(
      await screen.findByText("Today didn't update just now. Check your connection and try again."),
    ).toBeVisible()
    expect(await doses()).toHaveTextContent('Morning Tablet')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() =>
      expect(
        screen.queryByText("Today didn't update just now. Check your connection and try again."),
      ).not.toBeInTheDocument(),
    )
    expect(await doses()).toHaveTextContent('Morning Tablet')
    expect(api.reads()).toBe(2)
  })
})

describe('recording a dose', () => {
  test.each(['Taken', 'Skipped'] as const)(
    'a pending %s keeps row order, Up next and logged count until confirmation',
    async (outcome) => {
      schedulesApi(initialNow, [
        {
          ...scheduleFor('09:00'),
          times: [
            { time: '09:00', quantity: 1 },
            { time: '10:00', quantity: 1 },
          ],
        },
      ])
      let release = () => {}
      const gate = new Promise<void>((resolve) => (release = resolve))
      server.use(
        http.put('/api/schedules', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          await gate
          return HttpResponse.json({
            record: {
              ...body,
              ...(outcome === 'Skipped' ? { recordedAt: initialNow } : {}),
              revision: 0,
            },
          })
        }),
      )
      const user = renderToday()
      const list = await doses()
      const row = within(list).getAllByRole('listitem')[0]
      await user.click(within(row).getByRole('button', { name: /^Record dose for Morning Tablet/ }))
      await user.click(
        await screen.findByRole('button', {
          name: outcome === 'Taken' ? 'I took it' : 'I skipped it',
        }),
      )
      await user.click(
        await screen.findByRole('button', {
          name: outcome === 'Taken' ? 'Save as taken' : 'Save as skipped',
        }),
      )
      expect(row).toHaveTextContent(`Saving · ${outcome}`)
      expect(within(list).getAllByRole('listitem', { hidden: true })[0]).toBe(row)
      expect(
        screen.getByRole('heading', { name: 'Later today · 2', hidden: true }),
      ).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Up next', hidden: true })).toBeInTheDocument()
      expect(client.getQueryData<{ records: unknown[] }>(scheduleKeys.snapshot())?.records).toEqual(
        [],
      )
      release()
      await waitFor(() => expect(row).not.toHaveTextContent(`Saving · ${outcome}`))
      expect(row).toHaveTextContent(outcome)
      expect(screen.getByRole('heading', { name: 'Logged · 1' })).toBeVisible()
      expect(screen.getByRole('heading', { name: 'Later today · 1' })).toBeVisible()
    },
  )

  test('a different Taken record does not confirm an uncertain attempt or discard its details', async () => {
    schedulesApi(initialNow)
    const user = renderToday()
    await doses()
    server.use(http.put('/api/schedules', () => HttpResponse.json({}, { status: 503 })))
    await user.click(screen.getByRole('button', { name: /^Record dose for Morning Tablet/ }))
    await user.click(await screen.findByRole('button', { name: 'I took it' }))
    server.use(
      http.get('/api/schedules', () =>
        HttpResponse.json({
          schedules: [scheduleFor('09:00')],
          records: [
            {
              scheduleId: scheduleFor('09:00').id,
              dueAt: '2026-11-14T06:00:00.000Z',
              outcome: 'Taken',
              takenAt: '2026-11-14T05:50:00.000Z',
              quantity: 2,
              revision: 0,
            },
          ],
          today: { now: initialNow, date: '2026-11-14' },
        }),
      ),
    )
    await user.click(await screen.findByRole('button', { name: 'Save as taken' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(await screen.findByText("This dose has changed. Check what's saved now.")).toBeVisible()
    expect(screen.getByRole('button', { name: "Check what's saved" })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try saving as taken again' })).toBeDisabled()
  })

  test('an unconfirmed Now retry keeps the exact time and amount and makes one fresh check', async () => {
    const api = schedulesApi(initialNow)
    const payloads: Record<string, unknown>[] = []
    server.use(
      http.put('/api/schedules', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        payloads.push(body)
        if (payloads.length === 1) return HttpResponse.json({}, { status: 503 })
        return HttpResponse.json({ record: { ...body, revision: 0 } })
      }),
    )
    const user = renderToday()
    const list = await doses()
    await user.click(screen.getByRole('button', { name: /^Record dose for Morning Tablet/ }))
    await user.click(await screen.findByRole('button', { name: 'I took it' }))
    await user.click(await screen.findByRole('button', { name: 'Save as taken' }))
    expect(await screen.findByText(/Meddies checked and can't find it yet/)).toBeVisible()
    expect(api.reads()).toBe(2)
    expect(list).toHaveTextContent('Might not have saved')
    await advance(2 * 60_000)
    expect(api.reads()).toBe(2)
    await user.click(screen.getByRole('button', { name: 'Try saving as taken again' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Morning Tablet' })).not.toBeInTheDocument(),
    )
    expect(payloads).toHaveLength(2)
    expect(payloads[1]).toEqual(payloads[0])
    expect(payloads[1].takenAt).toBe('2026-11-14T05:55:00.000Z')
    expect(list).toHaveTextContent('Taken')
  })

  test.each([200, 400])(
    'a correction response %s retains a newer confirmed outcome',
    async (status) => {
      schedulesApi(initialNow)
      const original: DoseOutcomeRecord = {
        scheduleId: scheduleFor('09:00').id,
        dueAt: '2026-11-14T06:00:00.000Z',
        outcome: 'Taken',
        takenAt: initialNow,
        quantity: 1,
        revision: 0,
      }
      const newer: DoseOutcomeRecord = {
        ...original,
        quantity: 2,
        revision: 2,
        actionId: '00000000-0000-4000-8000-000000000099',
      }
      let current = original
      let release = () => {}
      const gate = new Promise<void>((resolve) => (release = resolve))
      server.use(
        http.get('/api/schedules', () =>
          HttpResponse.json({
            schedules: [scheduleFor('09:00')],
            records: [current],
            today: { now: initialNow, date: '2026-11-14' },
          }),
        ),
        http.patch('/api/schedules', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          await gate
          return status === 400
            ? HttpResponse.json({}, { status })
            : HttpResponse.json({
                record: {
                  scheduleId: original.scheduleId,
                  dueAt: original.dueAt,
                  outcome: 'Skipped',
                  recordedAt: initialNow,
                  revision: 1,
                  actionId: body.actionId,
                },
              })
        }),
      )
      const user = renderToday()
      const list = await doses()
      const row = within(list).getByRole('listitem')
      await user.click(screen.getByRole('button', { name: /^Review dose for Morning Tablet/ }))
      await user.click(screen.getByRole('button', { name: /^Change dose for/ }))
      await user.click(screen.getByRole('button', { name: 'I skipped it' }))
      await user.click(screen.getByRole('button', { name: 'Save as skipped' }))
      expect(row).toHaveTextContent('Saving · Skipped')
      expect(screen.getByRole('heading', { name: 'Logged · 1', hidden: true })).toBeInTheDocument()
      current = newer
      fireEvent(window, new Event('focus'))
      await waitFor(() => expect(row).toHaveTextContent('took 2 tablets'))
      expect(row).toHaveTextContent('Saving · Skipped')
      release()
      await waitFor(() => expect(row).not.toHaveTextContent('Saving · Skipped'))
      expect(row).toHaveTextContent('Taken')
      expect(row).toHaveTextContent('took 2 tablets')
      if (status === 200) {
        expect(
          await screen.findByText(
            'Your earlier save went through. This dose has changed since then.',
          ),
        ).toBeVisible()
      } else {
        expect(screen.getByRole('dialog', { name: 'Morning Tablet' })).toBeVisible()
        expect(screen.getByRole('button', { name: 'Save as skipped' })).toBeEnabled()
        expect(screen.getByText('Not saved.')).toBeVisible()
      }
    },
  )

  test('a rejected Taken attempt keeps entered values and unrelated confirmed work', async () => {
    const first = scheduleFor('09:00')
    const second = { ...scheduleFor('10:00'), id: '00000000-0000-4000-8000-0000000000a2' }
    schedulesApi(initialNow, [first, second])
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.put('/api/schedules', async () => {
        await gate
        return HttpResponse.json({}, { status: 400 })
      }),
    )
    const user = renderToday()
    const list = await doses()
    const rows = within(list).getAllByRole('listitem')
    await user.click(within(rows[0]).getByRole('button'))
    await user.click(screen.getByRole('button', { name: 'I took it' }))
    const amount = screen.getByLabelText(/^Amount/)
    await user.clear(amount)
    await user.type(amount, '2')
    await user.click(screen.getByRole('button', { name: 'Save as taken' }))
    const unrelated: DoseOutcomeRecord = {
      scheduleId: second.id,
      dueAt: '2026-11-14T07:00:00.000Z',
      outcome: 'Skipped',
      recordedAt: initialNow,
      revision: 0,
    }
    server.use(
      http.get('/api/schedules', () =>
        HttpResponse.json({
          schedules: [first, second],
          records: [unrelated],
          today: { now: initialNow, date: '2026-11-14' },
        }),
      ),
    )
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(rows[1]).toHaveTextContent('Skipped'))
    release()
    expect(await screen.findByText('Not saved.')).toBeVisible()
    expect(amount).toHaveValue('2')
    expect(rows[0]).not.toHaveTextContent('Saving')
    expect(rows[0]).toHaveTextContent('Scheduled')
    expect(rows[1]).toHaveTextContent('Skipped')
    expect(screen.getByRole('heading', { name: 'Logged · 1', hidden: true })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close dose details' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(rows[0]).toHaveTextContent(
      'Not saved. The time taken has to be in the past. Change the time and save again.',
    )
  })

  test.each(['Taken', 'Skipped'] as const)(
    'one fresh read can establish an initial %s receipt',
    async (outcome) => {
      schedulesApi(initialNow)
      const user = renderToday()
      await doses()
      let stored: Record<string, unknown> | null = null
      let checks = 0
      server.use(
        http.put('/api/schedules', async ({ request }) => {
          stored = {
            ...((await request.json()) as Record<string, unknown>),
            revision: 0,
            ...(outcome === 'Skipped' ? { recordedAt: initialNow } : {}),
          }
          return HttpResponse.json({}, { status: 503 })
        }),
        http.get('/api/schedules', () => {
          checks++
          return HttpResponse.json({
            schedules: [scheduleFor('09:00')],
            records: stored ? [stored] : [],
            today: { now: initialNow, date: '2026-11-14' },
          })
        }),
      )
      await user.click(screen.getByRole('button', { name: /^Record dose for Morning Tablet/ }))
      await user.click(
        screen.getByRole('button', { name: outcome === 'Taken' ? 'I took it' : 'I skipped it' }),
      )
      await user.click(
        screen.getByRole('button', {
          name: outcome === 'Taken' ? 'Save as taken' : 'Save as skipped',
        }),
      )
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Morning Tablet' })).not.toBeInTheDocument(),
      )
      await waitFor(() => expect(checks).toBe(2)) // receipt check, then confirmed reconciliation
      expect(await doses()).toHaveTextContent(outcome)
    },
  )

  test('an unconfirmed correction retries its action and preconditions after learning a newer outcome', async () => {
    schedulesApi(initialNow)
    let record: DoseOutcomeRecord = {
      scheduleId: scheduleFor('09:00').id,
      dueAt: '2026-11-14T06:00:00.000Z',
      outcome: 'Taken',
      takenAt: initialNow,
      quantity: 1,
      revision: 0,
    }
    const payloads: Record<string, unknown>[] = []
    server.use(
      http.get('/api/schedules', () =>
        HttpResponse.json({
          schedules: [scheduleFor('09:00')],
          records: [record],
          today: { now: initialNow, date: '2026-11-14' },
        }),
      ),
      http.patch('/api/schedules', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        payloads.push(body)
        if (payloads.length === 1) return HttpResponse.json({}, { status: 503 })
        return HttpResponse.json({
          record: {
            scheduleId: record.scheduleId,
            dueAt: record.dueAt,
            outcome: 'Skipped',
            recordedAt: initialNow,
            revision: 1,
            actionId: body.actionId,
          },
        })
      }),
    )
    const user = renderToday()
    const list = await doses()
    await user.click(screen.getByRole('button', { name: /^Review dose for Morning Tablet/ }))
    await user.click(screen.getByRole('button', { name: /^Change dose for/ }))
    await user.click(screen.getByRole('button', { name: 'I skipped it' }))
    await user.click(screen.getByRole('button', { name: 'Save as skipped' }))
    await screen.findByRole('button', { name: 'Try saving as skipped again' })
    expect(screen.queryByText(/can't find it yet/)).not.toBeInTheDocument()
    record = {
      ...record,
      quantity: 2,
      revision: 2,
      actionId: '00000000-0000-4000-8000-000000000099',
    }
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(list).toHaveTextContent('took 2 tablets'))
    await user.click(screen.getByRole('button', { name: 'Try saving as skipped again' }))
    expect(
      await screen.findByText('Your earlier save went through. This dose has changed since then.'),
    ).toBeVisible()
    expect(payloads).toHaveLength(2)
    expect(payloads[1]).toEqual(payloads[0])
    expect(payloads[1]).toMatchObject({
      expectedRevision: 0,
      expectedOutcome: 'Taken',
      outcome: 'Skipped',
    })
    expect(list).toHaveTextContent('took 2 tablets')
  })

  test('recording a dose reads in plain wording', async () => {
    schedulesApi(initialNow)
    const user = renderToday()
    await doses()
    await user.click(screen.getByRole('button', { name: /^Record dose for Morning Tablet/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Morning Tablet' })
    expect(within(dialog).getByText('What happened?')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Choose what happened' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'I skipped it' }))
    expect(within(dialog).getByRole('group', { name: 'Skip this dose' })).toBeVisible()
    expect(within(dialog).getByRole('group', { name: 'Skip Morning Tablet' })).toHaveTextContent(
      'Skip Morning Tablet, scheduled for 09:00? No time or amount is saved.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'I took it' }))
    expect(
      within(dialog).getByRole('group', { name: 'What you took: Morning Tablet' }),
    ).toBeVisible()
  })

  test('changing a skipped dose reads in plain wording', async () => {
    schedulesApi(initialNow)
    const record: DoseOutcomeRecord = {
      scheduleId: scheduleFor('09:00').id,
      dueAt: '2026-11-14T06:00:00.000Z',
      outcome: 'Skipped',
      recordedAt: initialNow,
      revision: 0,
    }
    server.use(
      http.get('/api/schedules', () =>
        HttpResponse.json({
          schedules: [scheduleFor('09:00')],
          records: [record],
          today: { now: initialNow, date: '2026-11-14' },
        }),
      ),
    )
    const user = renderToday()
    await doses()
    await user.click(screen.getByRole('button', { name: /^Review dose for Morning Tablet/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Morning Tablet' })
    expect(within(dialog).getByText('Skipped. Nothing recorded as taken.')).toBeVisible()
    const change = within(dialog).getByRole('button', {
      name: 'Change dose for Morning Tablet at 09:00',
    })
    expect(change).toHaveTextContent('Change this dose')
    await user.click(change)
    expect(within(dialog).getByText('What happened?')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'I took it' }))
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeVisible()
  })

  test('an uncertain correction shows the current intake beside its preserved recovery details', async () => {
    schedulesApi(initialNow)
    let record: DoseOutcomeRecord = {
      scheduleId: scheduleFor('09:00').id,
      dueAt: '2026-11-14T06:00:00.000Z',
      outcome: 'Taken',
      takenAt: initialNow,
      quantity: 1,
      revision: 0,
    }
    server.use(
      http.get('/api/schedules', () =>
        HttpResponse.json({
          schedules: [scheduleFor('09:00')],
          records: [record],
          today: { now: initialNow, date: '2026-11-14' },
        }),
      ),
      http.patch('/api/schedules', () => {
        record = {
          ...record,
          outcome: 'Taken',
          takenAt: initialNow,
          quantity: 2,
          revision: 2,
          actionId: '00000000-0000-4000-8000-000000000099',
        }
        return HttpResponse.json({}, { status: 503 })
      }),
    )
    const user = renderToday()
    await doses()
    await user.click(screen.getByRole('button', { name: /^Review dose for Morning Tablet/ }))
    await user.click(screen.getByRole('button', { name: /^Change dose for/ }))
    await user.click(screen.getByRole('button', { name: 'I skipped it' }))
    await user.click(screen.getByRole('button', { name: 'Save as skipped' }))
    const dialog = screen.getByRole('dialog', { name: 'Morning Tablet' })
    expect(
      await within(dialog).findByText("This dose has changed. Check what's saved now."),
    ).toBeVisible()
    expect(dialog).toHaveTextContent('Taken 2 tablets at 08:55')
    expect(within(dialog).getByRole('button', { name: /^Edit dose for/ })).toBeDisabled()
    expect(
      within(dialog).getByRole('button', { name: 'Try saving as skipped again' }),
    ).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: "Check what's saved" }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(await doses()).toHaveTextContent('took 2 tablets')
  })

  test('a 409 applies no attempted outcome and offers explicit review after closing', async () => {
    schedulesApi(initialNow)
    const user = renderToday()
    const list = await doses()
    server.use(
      http.put('/api/schedules', () => HttpResponse.json({}, { status: 409 })),
      http.get('/api/schedules', () =>
        HttpResponse.json({
          schedules: [scheduleFor('09:00')],
          records: [
            {
              scheduleId: scheduleFor('09:00').id,
              dueAt: '2026-11-14T06:00:00.000Z',
              outcome: 'Skipped',
              recordedAt: initialNow,
              revision: 0,
            },
          ],
          today: { now: initialNow, date: '2026-11-14' },
        }),
      ),
    )
    await user.click(screen.getByRole('button', { name: /^Record dose for Morning Tablet/ }))
    await user.click(screen.getByRole('button', { name: 'I took it' }))
    await user.click(screen.getByRole('button', { name: 'Save as taken' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Morning Tablet' })).not.toBeInTheDocument(),
    )
    expect(list).toHaveTextContent('Skipped')
    expect(list).not.toHaveTextContent('Taken')
    expect(list).toHaveTextContent("This dose is already logged. Check what's saved.")
    expect(within(list).getByRole('button', { name: "Check what's saved" })).toBeVisible()
  })

  test('a read started before the save cannot overwrite the confirmed outcome', async () => {
    const api = schedulesApi(initialNow)
    const user = renderToday()
    expect(await doses()).toHaveTextContent('Scheduled')
    // A focus refresh starts before the save and answers after it, without the record.
    const release = api.hold()
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(api.reads()).toBe(2))
    await user.click(screen.getByRole('button', { name: /^Record dose for Morning Tablet/ }))
    await user.click(await screen.findByRole('button', { name: 'I skipped it' }))
    await user.click(await screen.findByRole('button', { name: 'Save as skipped' }))
    await waitFor(() =>
      expect(screen.getByRole('list', { name: "Today's doses" })).toHaveTextContent('Skipped'),
    )
    release()
    await waitFor(() => expect(api.reads()).toBe(3))
    await advance(1_000)
    expect(screen.getByRole('list', { name: "Today's doses" })).toHaveTextContent('Skipped')
  })
})

describe('streamed section fallback', () => {
  const renderFallback = () =>
    render(
      <QueryClientProvider client={client}>
        <TodayDosesFallback initialNow={initialNow} />
      </QueryClientProvider>,
    )

  test('shows the session’s cached doses while the server reads', async () => {
    const api = schedulesApi(initialNow)
    client.setQueryData(scheduleKeys.snapshot(), {
      schedules: [scheduleFor('09:00')],
      records: [],
      now: initialNow,
      date: '2026-11-14',
    })
    renderFallback()
    expect(await doses()).toHaveTextContent('Morning Tablet')
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
    await advance(1_000)
    expect(api.reads()).toBe(0)
  })

  test('shows the skeleton without starting a read when nothing is cached', async () => {
    const api = schedulesApi(initialNow)
    renderFallback()
    expect(screen.getByRole('status')).toHaveTextContent(/^Loading today’s doses$/)
    await advance(1_000)
    expect(api.reads()).toBe(0)
    expect(client.getQueryCache().find({ queryKey: scheduleKeys.snapshot() })).toBeUndefined()
  })
})

describe('server hydration', () => {
  test('a snapshot the server just read renders without a browser read', async () => {
    const api = schedulesApi(initialNow)
    const serverClient = createQueryClient()
    serverClient.setQueryData(scheduleKeys.snapshot(), {
      schedules: [scheduleFor('09:00')],
      records: [],
      now: initialNow,
      date: '2026-11-14',
    })
    client.clear()
    render(
      <QueryClientProvider client={client}>
        {/* As the page composes it: the shell header outside the streamed section's boundary. */}
        <TodayHeader initialNow={initialNow} />
        <HydrationBoundary state={dehydrate(serverClient)}>
          <SchedulePanel mode="today" initialNow={initialNow} />
        </HydrationBoundary>
      </QueryClientProvider>,
    )
    expect(await doses()).toHaveTextContent('Scheduled')
    await advance(1_000)
    expect(api.reads()).toBe(0)
  })
})

describe('with no cache', () => {
  test('the first read holds the doses section with its skeleton and one status', async () => {
    const api = schedulesApi(initialNow)
    const release = api.hold()
    renderToday()
    await waitFor(() => expect(api.reads()).toBe(1))
    const section = screen.getByRole('region', { name: 'Your doses' })
    expect(within(section).getByRole('status')).toHaveTextContent(/^Loading today’s doses$/)
    const placeholders = section.querySelectorAll('[data-slot="skeleton"]')
    expect(placeholders).toHaveLength(5)
    for (const placeholder of placeholders)
      expect(placeholder).toHaveAttribute('aria-hidden', 'true')
    release()
    expect(await doses()).toHaveTextContent('Scheduled')
    expect(section.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
  })

  test('a failed first read shows the error, and retry loads Today', async () => {
    const api = schedulesApi(initialNow)
    api.failNext()
    const user = renderToday()
    expect(
      await screen.findByText("Today didn't update just now. Check your connection and try again."),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: "Today's doses" })).not.toBeInTheDocument()
    expect(screen.queryByText('Loading today’s doses')).not.toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await doses()).toHaveTextContent('Scheduled')
    expect(api.reads()).toBe(2)
  })
})

describe('wording', () => {
  const failMedicines = () =>
    server.use(http.get('/api/medicines', () => HttpResponse.json({}, { status: 503 })))

  test('an empty day and the time zone hint read as approved', async () => {
    schedulesApi(initialNow, [])
    renderToday()
    expect(await screen.findByText("Nothing to take today. You're all set.")).toBeVisible()
    expect(
      screen.getByText('All dates and times are Istanbul time, wherever you are.'),
    ).toBeVisible()
  })

  test('medications that never loaded say Today cannot show doses', async () => {
    schedulesApi(initialNow)
    failMedicines()
    client.removeQueries({ queryKey: medicineKeys.list() })
    renderToday()
    expect(
      await screen.findByText(
        "Your medications didn't load just now, so Today can't show your doses. Check your connection and try again.",
      ),
    ).toBeVisible()
  })

  test('a failed medication refresh says the last list is showing', async () => {
    schedulesApi(initialNow)
    failMedicines()
    client.setQueryData(medicineKeys.list(), [medicine], { updatedAt: 0 })
    renderToday()
    expect(
      await screen.findByText(
        "Medication details didn't update just now. Showing the last list that loaded.",
      ),
    ).toBeVisible()
  })
})

describe('next actions', () => {
  test('groups saved statuses in time order, with status and time in the hero eyebrow', async () => {
    const now = '2026-11-14T06:00:00.000Z'
    schedulesApi(now, [
      {
        ...scheduleFor('09:00'),
        times: [
          { time: '10:00', quantity: 1 },
          { time: '09:00', quantity: 1 },
          { time: '08:00', quantity: 1 },
        ],
      },
    ])
    renderToday(now)
    const list = await doses()
    expect(
      within(list)
        .getAllByRole('heading', { level: 3 })
        .map((item) => item.textContent),
    ).toEqual(['To log · 2', 'Later today · 1'])
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.slice(0, 5)),
    ).toEqual(['08:00', '09:00', '10:00'])
    expect(screen.queryByRole('heading', { name: /^Logged/ })).not.toBeInTheDocument()
    expect(screen.getByText('Due now ·', { exact: false })).toHaveTextContent('Due now · 09:00')
  })

  test('all logged keeps only Logged and a dated future hero without actions', async () => {
    schedulesApi(initialNow)
    client.setQueryData(
      scheduleKeys.snapshot(),
      {
        date: '2026-11-14',
        schedules: [scheduleFor('09:00')],
        records: [
          {
            scheduleId: scheduleFor('09:00').id,
            dueAt: '2026-11-14T06:00:00.000Z',
            outcome: 'Skipped',
            recordedAt: initialNow,
          },
        ],
      },
      { updatedAt: Date.now() },
    )
    renderToday()
    expect(await screen.findByRole('heading', { name: 'Logged · 1' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: /^(To log|Later today)/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Scheduled ·/)).toHaveTextContent('Scheduled · 09:00 on 2026-11-15')
    expect(screen.queryByRole('button', { name: /^Record .* as taken$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Record .* as skipped$/ })).not.toBeInTheDocument()
  })

  test('an empty day hides Up next even when a future dose exists', async () => {
    schedulesApi(initialNow, [{ ...scheduleFor('09:00'), startDate: '2026-11-15' }])
    renderToday()
    expect(await screen.findByText("Nothing to take today. You're all set.")).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Up next' })).not.toBeInTheDocument()
  })

  test('no medications offers a route to Medications', async () => {
    schedulesApi(initialNow, [])
    client.setQueryData(medicineKeys.list(), [])
    server.use(http.get('/api/medicines', () => HttpResponse.json({ medicines: [] })))
    renderToday()
    expect(await screen.findByRole('link', { name: 'Go to Medications' })).toHaveAttribute(
      'href',
      '/medications',
    )
    expect(
      screen.getByText("No medications here yet. Add your first one whenever you're ready."),
    ).toBeVisible()
  })
})
