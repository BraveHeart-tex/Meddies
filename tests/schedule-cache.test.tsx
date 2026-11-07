import { dehydrate, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { HistoryHydration } from '../src/features/schedules/history-hydration'
import { TodayHydration } from '../src/features/schedules/today-hydration'
import { expect, test } from 'vitest'
import {
  applyRecord,
  historyDayQuery,
  readFreshSnapshot,
  scheduleKeys,
  type ScheduleSnapshot,
} from '../src/features/schedules/queries'
import type { DoseOccurrence, DoseOutcomeRecord } from '../src/features/schedules/contract'
import { createQueryClient } from '../src/lib/session-query-client'
import { http, HttpResponse } from 'msw'
import { server } from './helpers/msw-server'

const base: ScheduleSnapshot = {
  schedules: [],
  records: [],
  now: '2026-11-14T06:00:00.000Z',
  date: '2026-11-14',
}
const original: DoseOutcomeRecord = {
  scheduleId: '00000000-0000-4000-8000-000000000001',
  dueAt: base.now,
  outcome: 'Skipped',
  recordedAt: base.now,
  revision: 0,
}
const latest: DoseOutcomeRecord = {
  ...original,
  revision: 2,
  actionId: '00000000-0000-4000-8000-000000000002',
}

test('a late hydration, stale read or older receipt cannot erase a confirmed revision', async () => {
  const client = createQueryClient()
  const incoming = createQueryClient()
  client.setQueryData(scheduleKeys.snapshot(), { ...base, records: [latest] }, { updatedAt: 1 })
  incoming.setQueryData(scheduleKeys.snapshot(), { ...base, records: [] }, { updatedAt: 2 })
  render(
    <QueryClientProvider client={client}>
      <TodayHydration state={dehydrate(incoming)}>
        <span />
      </TodayHydration>
    </QueryClientProvider>,
  )
  expect(client.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())?.records).toEqual([latest])
  server.use(
    http.get('/api/schedules', () =>
      HttpResponse.json({ ...base, records: [original], today: base }),
    ),
  )
  await readFreshSnapshot(client)
  await applyRecord(client, { ...original, revision: 1 })
  expect(client.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())?.records).toEqual([latest])
  client.clear()
  incoming.clear()
})

const scheduleId = original.scheduleId
// Due 22:30 on Thu 5 Nov in Istanbul, taken 00:10 on Fri 6 Nov.
const lateDueAt = '2026-11-05T19:30:00.000Z'
const lateDose: DoseOccurrence = {
  id: `${scheduleId}:22:30`,
  scheduleId,
  medicineId: '00000000-0000-4000-8000-0000000000f1',
  dueAt: lateDueAt,
  quantity: 1,
  status: 'Not logged',
}
const lateTaken: DoseOutcomeRecord = {
  scheduleId,
  dueAt: lateDueAt,
  outcome: 'Taken',
  takenAt: '2026-11-05T21:10:00.000Z',
  quantity: 1,
  revision: 0,
}

test('a confirmed record lands on its History date and on Today only when due today', async () => {
  const client = createQueryClient()
  client.setQueryData(scheduleKeys.snapshot(), { ...base, date: '2026-11-06' })
  client.setQueryData(scheduleKeys.history('2026-11-05'), [lateDose])
  client.setQueryData(scheduleKeys.history('2026-11-06'), [])
  await applyRecord(client, lateTaken)
  // Taken on Fri 6 Nov, still shown on its due date's row.
  expect(client.getQueryData(scheduleKeys.history('2026-11-05'))).toEqual([
    { ...lateDose, status: 'Taken', record: lateTaken },
  ])
  expect(client.getQueryData(scheduleKeys.history('2026-11-06'))).toEqual([])
  expect(client.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())?.records).toEqual([])
  client.setQueryData(scheduleKeys.snapshot(), { ...base, date: '2026-11-05' })
  await applyRecord(client, lateTaken)
  expect(client.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())?.records).toEqual([
    lateTaken,
  ])
  client.clear()
})

test('a stale History read or late History hydration cannot erase a confirmed revision', async () => {
  const client = createQueryClient()
  const incoming = createQueryClient()
  const corrected = { ...lateTaken, revision: 2, actionId: latest.actionId } as DoseOutcomeRecord
  const confirmed = { ...lateDose, status: 'Taken', record: corrected } as DoseOccurrence
  client.setQueryData(scheduleKeys.history('2026-11-05'), [confirmed], { updatedAt: 1 })
  incoming.setQueryData(scheduleKeys.history('2026-11-05'), [lateDose], { updatedAt: 2 })
  render(
    <QueryClientProvider client={client}>
      <HistoryHydration state={dehydrate(incoming)}>
        <span />
      </HistoryHydration>
    </QueryClientProvider>,
  )
  expect(client.getQueryData(scheduleKeys.history('2026-11-05'))).toEqual([confirmed])
  server.use(
    http.get('/api/schedules/history', () =>
      HttpResponse.json({
        doses: [{ ...lateDose, status: 'Taken', record: { ...lateTaken, revision: 1 } }],
      }),
    ),
  )
  await client.fetchQuery({ ...historyDayQuery('2026-11-05'), staleTime: 0 })
  expect(client.getQueryData(scheduleKeys.history('2026-11-05'))).toEqual([confirmed])
  client.clear()
  incoming.clear()
})
