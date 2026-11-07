import { dehydrate, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { TodayHydration } from '../src/features/schedules/today-hydration'
import { expect, test } from 'vitest'
import {
  applyRecord,
  readFreshSnapshot,
  scheduleKeys,
  type ScheduleSnapshot,
} from '../src/features/schedules/queries'
import type { DoseOutcomeRecord } from '../src/features/schedules/contract'
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
