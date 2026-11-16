import { dehydrate, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { confirmMedicineArchive } from '@/features/medicines/confirm-medicine-archive'
import { isArchived, type Medicine, type MedicineRecord } from '@/features/medicines/contract'
import { medicineKeys, medicinesQuery } from '@/features/medicines/queries'
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
const active: MedicineRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Magnesium',
  strength: '400 mg',
  unit: 'tablet',
  revision: 1,
  lastActionId: null,
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
  archivedAt: null,
}
const actionId = '55555555-5555-4555-8555-555555555555'
const archived: MedicineRecord = { ...active, revision: 2, lastActionId: actionId, archivedAt: now }
const schedule = {
  id: '33333333-3333-4333-8333-333333333333',
  medicineId: active.id,
  startDate: '2035-06-01',
  times: [{ time: '20:00', quantity: 1 }],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  confirmedAt: '2035-06-01T00:00:00.000Z',
}
const before: ScheduleSnapshot = { schedules: [schedule], records: [], date: '2035-06-15', now }

function shows(client: ReturnType<typeof createQueryClient>) {
  const list = client.getQueryData<Medicine[]>(medicineKeys.list())!
  const snapshot = client.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())!
  return {
    medications: list.filter((item) => !isArchived(item)).map((item) => item.id),
    archived: list.filter(isArchived).map((item) => item.id),
    upNext: scheduleToday(snapshot.schedules, new Date(now), snapshot.records).next,
  }
}

// Regression: a pre-archive read or server handoff returned Magnesium to Medications and Today.
test('a confirmed archive stays what Medications, Archived medications, Today and schedules show after delayed reads and late hydration', async () => {
  const client = createQueryClient()
  // Reads that started before the archive confirmed answer with pre-archive state.
  server.use(
    http.get('/api/medicines', async () => {
      await delay(50)
      return HttpResponse.json({ medicines: [active] })
    }),
    http.get('/api/schedules', async () => {
      await delay(50)
      return HttpResponse.json({
        schedules: [schedule],
        records: [],
        today: { date: before.date, now },
      })
    }),
  )
  client.setQueryData(medicineKeys.list(), [active])
  client.setQueryData(scheduleKeys.snapshot(), before)
  expect(shows(client).upNext).not.toBeNull()
  const lateList = client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 }).catch(() => null)
  const lateSnapshot = client.fetchQuery(scheduleSnapshotQuery()).catch(() => null)
  await confirmMedicineArchive(client, archived)
  await Promise.all([lateList, lateSnapshot])
  const expected = { medications: [], archived: [active.id], upNext: null }
  expect(shows(client)).toEqual(expected)
  const stop = client
    .getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())!
    .schedules.find((item) => item.id === actionId)
  expect(stop).toMatchObject({
    basedOnId: schedule.id,
    stoppedAt: now,
    confirmedAt: now,
    archiveStop: true,
  })

  // A full stale read completes after the archive.
  await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
  await client.fetchQuery(scheduleSnapshotQuery())
  expect(shows(client)).toEqual(expected)

  // A server render from before the archive hydrates late.
  const incoming = createQueryClient()
  incoming.setQueryData(medicineKeys.list(), [active], { updatedAt: Date.now() + 1000 })
  incoming.setQueryData(scheduleKeys.snapshot(), before, { updatedAt: Date.now() + 1000 })
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
