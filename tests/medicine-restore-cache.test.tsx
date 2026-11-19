import { dehydrate, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { confirmMedicineRestore } from '@/features/medicines/confirm-medicine-archive'
import { isArchived, type Medicine, type MedicineRecord } from '@/features/medicines/contract'
import { medicineKeys, medicinesQuery } from '@/features/medicines/queries'
import { currentSchedule } from '@/features/schedules/contract'
import { scheduleToday } from '@/features/schedules/occurrences'
import {
  scheduleKeys,
  scheduleSnapshotQuery,
  type ScheduleSnapshot,
} from '@/features/schedules/queries'
import { PrivateQueryHandoff } from '@/lib/private-query-handoff'
import { createQueryClient } from '@/lib/session-query-client'
import { server } from './helpers/msw-server'

const now = '2035-06-15T06:00:00.000Z'
const archivedAt = '2035-06-10T06:00:00.000Z'
const stopId = '44444444-4444-4444-8444-444444444444'
const archived: MedicineRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Magnesium',
  strength: '400 mg',
  unit: 'tablet',
  stock: { tracked: false },
  revision: 2,
  lastActionId: stopId,
  currentStrengthRevisionId: '22222222-2222-4222-8222-222222222222',
  strengthRevisions: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      label: 'Magnesium',
      unit: 'tablet',
      strength: '400 mg',
      effectiveAt: '2035-06-01T00:00:00.000Z',
      previousValues: [],
    },
  ],
  everHadSchedule: true,
  everHadDose: false,
  latestTakenAt: null,
  archivedAt,
}
const actionId = '55555555-5555-4555-8555-555555555555'
const restored: MedicineRecord = {
  ...archived,
  revision: 3,
  lastActionId: actionId,
  archivedAt: null,
}
const base = {
  id: '33333333-3333-4333-8333-333333333333',
  medicineId: archived.id,
  startDate: '2035-06-01',
  times: [{ time: '20:00', quantity: 1 }],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  confirmedAt: '2035-06-01T00:00:00.000Z',
  replacedAt: archivedAt,
}
const stop = {
  ...base,
  id: stopId,
  basedOnId: base.id,
  confirmedAt: archivedAt,
  stoppedAt: archivedAt,
  replacedAt: null,
  archiveStop: true,
}
const snapshot: ScheduleSnapshot = { schedules: [base, stop], records: [], date: '2035-06-15', now }
const historyKey = scheduleKeys.history('2035-06-14')

function shows(client: ReturnType<typeof createQueryClient>) {
  const list = client.getQueryData<Medicine[]>(medicineKeys.list())!
  const read = client.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())!
  const schedules = read.schedules.filter((item) => !item.replacedAt)
  return {
    medications: list.filter((item) => !isArchived(item)).map((item) => item.id),
    archived: list.filter(isArchived).map((item) => item.id),
    schedule: currentSchedule(schedules, archived.id) ?? 'No schedule',
    upNext: scheduleToday(read.schedules, new Date(now), read.records).next,
  }
}

// Regression: a pre-restore read or server handoff returned Magnesium to Archived medications.
test('only a confirmed restore moves Medications and Archived medications, keeps No schedule and survives delayed reads and late hydration', async () => {
  const client = createQueryClient()
  // Reads that started before the restore confirmed answer with archived state.
  server.use(
    http.get('/api/medicines', async () => {
      await delay(50)
      return HttpResponse.json({ medicines: [archived] })
    }),
    http.get('/api/schedules', async () => {
      await delay(50)
      return HttpResponse.json({
        schedules: snapshot.schedules,
        records: [],
        today: { date: snapshot.date, now },
      })
    }),
  )
  client.setQueryData(medicineKeys.list(), [archived])
  client.setQueryData(scheduleKeys.snapshot(), snapshot)
  client.setQueryData(historyKey, { records: [] })
  const archivedView = {
    medications: [],
    archived: [archived.id],
    schedule: 'No schedule',
    upNext: null,
  }
  expect(shows(client)).toEqual(archivedView)

  // A receipt that still carries archivedAt is not a restore; nothing changes.
  await confirmMedicineRestore(client, { ...restored, archivedAt })
  expect(shows(client)).toEqual(archivedView)
  expect(client.getQueryState(historyKey)?.isInvalidated).toBe(false)

  const lateList = client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 }).catch(() => null)
  const lateSnapshot = client.fetchQuery(scheduleSnapshotQuery()).catch(() => null)
  await confirmMedicineRestore(client, restored)
  // Today, History and schedule reads reconcile; Medications and Archived medications move now.
  expect(client.getQueryState(historyKey)?.isInvalidated).toBe(true)
  await Promise.all([lateList, lateSnapshot])
  const expected = {
    medications: [archived.id],
    archived: [],
    schedule: 'No schedule',
    upNext: null,
  }
  expect(shows(client)).toEqual(expected)

  // A full stale read completes after the restore.
  await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
  await client.fetchQuery(scheduleSnapshotQuery())
  expect(shows(client)).toEqual(expected)

  // A server render from before the restore hydrates late.
  const incoming = createQueryClient()
  incoming.setQueryData(medicineKeys.list(), [archived], { updatedAt: Date.now() + 1000 })
  incoming.setQueryData(scheduleKeys.snapshot(), snapshot, { updatedAt: Date.now() + 1000 })
  const view = render(
    <QueryClientProvider client={client}>
      <PrivateQueryHandoff state={dehydrate(incoming)}>
        <span />
      </PrivateQueryHandoff>
    </QueryClientProvider>,
  )
  expect(shows(client)).toEqual(expected)
  view.unmount()
  client.clear()
  incoming.clear()
})
