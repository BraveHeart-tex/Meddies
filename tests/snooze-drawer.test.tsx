import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { DoseActions } from '../src/features/schedules/dose-actions'
import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import type { DoseOccurrence } from '../src/features/schedules/contract'
import { endSessionSaves } from '../src/lib/session-saves'
import { Toaster } from '../src/components/ui/toast'
import { createQueryClient } from '../src/lib/session-query-client'
import {
  historyDayQuery,
  scheduleSnapshotQuery,
  scheduleKeys,
} from '../src/features/schedules/queries'
import { server } from './helpers/msw-server'

const dueAt = '2026-11-14T06:00:00.000Z'
const medicine = { id: 'medicine', label: 'Iron', strength: null, unit: 'tablet' as const }
const dose: DoseOccurrence = {
  id: 'dose',
  scheduleId: 'schedule',
  medicineId: medicine.id,
  dueAt,
  quantity: 1,
  status: 'Due now',
}
let client: ReturnType<typeof createQueryClient>
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1 })
  vi.spyOn(performance, 'now').mockReturnValue(0)
  client = createQueryClient()
  seed()
})
afterEach(() => client.clear())
function seed() {
  client.setQueryData(scheduleKeys.snapshot(), {
    schedules: [],
    records: [],
    date: '2026-11-14',
    now: '2026-11-14T06:05:00.000Z',
  })
  client.setQueryData(scheduleKeys.history('2026-11-14'), [dose])
}
function CachedDrawer({
  now,
  occurrence,
  source,
}: {
  now: string
  occurrence: DoseOccurrence
  source: 'today' | 'history'
}) {
  const snapshot = useQuery({ ...scheduleSnapshotQuery(), enabled: false }).data
  const history = useQuery({ ...historyDayQuery('2026-11-14'), enabled: false }).data
  const snooze = source === 'today' ? snapshot?.snoozes?.[0] : history?.[0]?.snooze
  return (
    <SchedulingClockProvider serverNow={now}>
      <DoseActions dose={{ ...occurrence, snooze }} medicine={medicine} />
    </SchedulingClockProvider>
  )
}
function view(
  now = '2026-11-14T06:05:00.000Z',
  occurrence = dose,
  source: 'today' | 'history' = 'history',
) {
  return (
    <QueryClientProvider client={client}>
      <Toaster>
        <CachedDrawer now={now} occurrence={occurrence} source={source} />
      </Toaster>
    </QueryClientProvider>
  )
}
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })
const snoozeName = 'Snooze dose for Iron scheduled at 09:00, 40 min'
async function open(u: ReturnType<typeof user>) {
  await u.click(screen.getByRole('button', { name: /^Record dose for Iron/ }))
}

test('Snooze respects the inclusive due window and disappears while an outcome form is open', async () => {
  const u = user()
  const app = render(view('2026-11-14T05:59:59.999Z', { ...dose, status: 'Upcoming' }))
  await open(u)
  expect(screen.queryByRole('button', { name: snoozeName })).not.toBeInTheDocument()
  app.rerender(view(dueAt))
  expect(screen.getByRole('button', { name: snoozeName })).toBeEnabled()
  app.rerender(view('2026-11-14T07:20:00.000Z', { ...dose, status: 'Not logged' }))
  expect(screen.getByRole('button', { name: snoozeName })).toBeEnabled()
  await u.click(screen.getByRole('button', { name: 'I skipped it' }))
  expect(screen.queryByRole('button', { name: snoozeName })).not.toBeInTheDocument()
  await u.click(screen.getByRole('button', { name: 'Close dose details' }))
  await open(u)
  await u.click(screen.getByRole('button', { name: 'I took it' }))
  expect(screen.queryByRole('button', { name: snoozeName })).not.toBeInTheDocument()
  await u.click(screen.getByRole('button', { name: 'Close dose details' }))
  app.rerender(view('2026-11-14T07:20:00.001Z', { ...dose, status: 'Not logged' }))
  await open(u)
  expect(screen.queryByRole('button', { name: snoozeName })).not.toBeInTheDocument()
})

test('Snooze blocks dismissal and choices until confirmation, then shows either accepted result on reopen without a Toast', async () => {
  const u = user()
  let release!: () => void
  let held = new Promise<void>((resolve) => {
    release = resolve
  })
  let outcome = 'snoozed'
  server.use(
    http.post('/api/snoozes', async () => {
      await held
      return HttpResponse.json({ outcome, targetAt: '2026-11-14T06:45:00.000Z' })
    }),
  )
  let releaseRead!: () => void
  let reads = 0
  let reading = new Promise<void>((resolve) => {
    releaseRead = resolve
  })
  server.use(
    http.get('/api/schedules', async () => {
      reads++
      await reading
      return HttpResponse.json({
        schedules: [],
        records: [],
        snoozes: [],
        today: { date: '2026-11-14', now: '2026-11-14T06:05:00.000Z' },
      })
    }),
    http.get('/api/schedules/history', async () => {
      reads++
      await reading
      return HttpResponse.json({ doses: [dose] })
    }),
  )
  const app = render(view())
  const lateReads = Promise.all([
    client.fetchQuery(scheduleSnapshotQuery()),
    client.fetchQuery(historyDayQuery('2026-11-14')),
  ])
  await waitFor(() => expect(reads).toBe(2))
  await open(u)
  await u.click(screen.getByRole('button', { name: snoozeName }))
  expect(screen.getByText('Snoozing...')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Close dose details' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'I took it' })).toBeDisabled()
  expect(screen.queryByText('Reminder at 09:45')).not.toBeInTheDocument()
  await u.keyboard('{Escape}')
  expect(screen.getByRole('dialog')).toBeVisible()
  await act(async () => release())
  expect(await screen.findByText(/Reminder at/)).toHaveTextContent('Reminder at 09:45')
  await act(async () => {
    releaseRead()
    await lateReads
  })
  expect(screen.getByText(/Reminder at/)).toHaveTextContent('Reminder at 09:45')
  app.rerender(view(undefined, dose, 'today'))
  expect(screen.getByText(/Reminder at/)).toHaveTextContent('Reminder at 09:45')
  expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: snoozeName })).not.toBeInTheDocument()
  await u.click(screen.getByRole('button', { name: 'Close dose details' }))
  await open(u)
  expect(screen.getByText(/Reminder at/)).toHaveTextContent('Reminder at 09:45')
  reading = Promise.resolve()
  await act(async () => {
    await client.fetchQuery(scheduleSnapshotQuery())
    await client.fetchQuery(historyDayQuery('2026-11-14'))
  })
  expect(screen.queryByText(/Reminder at/)).not.toBeInTheDocument()
  app.rerender(view())
  expect(screen.queryByText(/Reminder at/)).not.toBeInTheDocument()
  app.unmount()
  client.clear()
  client = createQueryClient()
  seed()
  outcome = 'dropped'
  held = Promise.resolve()
  const quietApp = render(view())
  await open(u)
  await u.click(screen.getByRole('button', { name: snoozeName }))
  expect(await screen.findByText('No reminder')).toBeVisible()
  expect(screen.getByText('09:45 is in quiet hours.')).toBeVisible()
  expect(screen.queryByRole('button', { name: snoozeName })).not.toBeInTheDocument()
  await u.click(screen.getByRole('button', { name: 'Close dose details' }))
  await open(u)
  expect(screen.getByText('No reminder')).toBeVisible()
  quietApp.rerender(view(undefined, dose, 'today'))
  expect(screen.getByText('No reminder')).toBeVisible()
})

test('every rejection offers its specified recovery; pending refreshes the existing Snooze without clearing it', async () => {
  const u = user()
  const reasons = [
    ['notificationsOff', 'Turn on notifications to snooze.', true],
    ['exhausted', 'No reminders are left for this dose.', false],
    ['expired', "It's too late to snooze this dose.", false],
    ['pending', 'This dose is already snoozed.', false],
    ['quietHours', 'No reminder is left outside quiet hours.', false],
    ...['logged', 'paused', 'superseded', 'notDue', 'notFound'].map(
      (reason) => [reason, "This dose has changed. Check what's saved now.", false] as const,
    ),
  ] as const
  let reason: string = 'notificationsOff'
  server.use(
    http.post('/api/snoozes', () => HttpResponse.json({ outcome: 'rejected', reason })),
    http.get('/api/schedules/history', () =>
      HttpResponse.json({
        doses: [{ ...dose, snooze: { outcome: 'pending', targetAt: '2026-11-14T06:40:00.000Z' } }],
      }),
    ),
    http.get('/api/schedules', () =>
      HttpResponse.json({
        schedules: [],
        records: [],
        today: { date: '2026-11-14', now: '2026-11-14T06:05:00.000Z' },
        snoozes: [
          {
            scheduleId: dose.scheduleId,
            dueAt,
            outcome: 'pending',
            targetAt: '2026-11-14T06:40:00.000Z',
          },
        ],
      }),
    ),
  )
  for (const [next, copy, available] of reasons) {
    reason = next
    const app = render(view(undefined, dose, 'today'))
    await open(u)
    await u.click(screen.getByRole('button', { name: snoozeName }))
    expect(await screen.findByText(copy)).toBeVisible()
    expect(screen.getByText('Not saved.')).toBeVisible()
    if (available) {
      expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
        'href',
        '/settings',
      )
      expect(screen.getByRole('button', { name: snoozeName })).toBeEnabled()
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      act(() => window.dispatchEvent(new Event('offline')))
      expect(screen.getByText("You're offline. Reconnect to snooze.")).toBeVisible()
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
      act(() => window.dispatchEvent(new Event('online')))
    } else expect(screen.queryByRole('button', { name: snoozeName })).not.toBeInTheDocument()
    if (next === 'pending')
      expect(screen.getByText(/Reminder at/)).toHaveTextContent('Reminder at 09:40')
    if (['logged', 'paused', 'superseded', 'notDue', 'notFound'].includes(next)) {
      await u.click(screen.getByRole('button', { name: "Check what's saved" }))
      await waitFor(() => expect(screen.queryByText('Not saved.')).not.toBeInTheDocument())
    }
    app.unmount()
    client.clear()
    client = createQueryClient()
    seed()
  }
})

test('an Unconfirmed Snooze retries identical payload after route unmount and ignores responses after Session end', async () => {
  const u = user()
  const requests: unknown[] = []
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post('/api/snoozes', async ({ request }) => {
      requests.push(await request.json())
      if (requests.length === 1) return HttpResponse.json({}, { status: 503 })
      await held
      return HttpResponse.json({ outcome: 'snoozed', targetAt: '2026-11-14T06:45:00.000Z' })
    }),
  )
  let app = render(view())
  await open(u)
  await u.click(screen.getByRole('button', { name: snoozeName }))
  expect(await screen.findByText('That might not have saved.')).toBeVisible()
  expect(
    screen.getByText('Check your connection and try again with the same details.'),
  ).toBeVisible()
  app.unmount()
  app = render(view())
  await open(u)
  await u.click(
    screen.getByRole('button', {
      name: 'Try snoozing again dose for Iron scheduled at 09:00, 40 min',
    }),
  )
  await waitFor(() => expect(requests).toHaveLength(2))
  expect(requests[1]).toEqual(requests[0])
  expect(requests[0]).toMatchObject({ scheduleId: 'schedule', dueAt, actionId: expect.any(String) })
  act(() => {
    endSessionSaves(client)
    client.clear()
  })
  await act(async () => release())
  expect(client.getQueryData(scheduleKeys.snapshot())).toBeUndefined()
  expect(client.getQueryData(scheduleKeys.history('2026-11-14'))).toBeUndefined()
  expect(screen.queryByText(/Reminder at/)).not.toBeInTheDocument()
  app.unmount()
})

test('offline Snooze keeps dose context, disables sending, and does not send on reconnect', async () => {
  let sends = 0
  server.use(
    http.post('/api/snoozes', () => {
      sends++
      return HttpResponse.json({})
    }),
  )
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const u = user()
  render(view())
  await open(u)
  expect(screen.getByText("You're offline. Reconnect to snooze.")).toBeVisible()
  const button = screen.getByRole('button', {
    name: 'Connect to snooze dose for Iron scheduled at 09:00, 40 min',
  })
  expect(button).toHaveTextContent('Connect to snooze')
  expect(button).toBeDisabled()
  await u.click(button)
  expect(sends).toBe(0)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  act(() => window.dispatchEvent(new Event('online')))
  expect(screen.getByRole('button', { name: snoozeName })).toBeEnabled()
  expect(sends).toBe(0)
})
