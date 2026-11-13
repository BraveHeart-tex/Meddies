import 'server-only'
import { dehydrate } from '@tanstack/react-query'
import { medicineKeys, medicinesQuery } from '@/features/medicines/queries'
import { medicines } from '@/features/medicines/server'
import { requestQueryClient } from '@/lib/request-query-client'
import { historyDayQuery, scheduleKeys, scheduleSnapshotQuery, toScheduleSnapshot } from './queries'
import { schedules } from './server'
import { seedUnscheduledDay } from '../unscheduled-doses/queries'

/**
 * Reads Today's medicines and schedules snapshot together into the request's Query client and
 * returns its display-only state for `PrivateQueryHandoff`. A failed read is left out, so the
 * browser reads it itself and shows Today's error and retry.
 */
export async function prefetchToday() {
  const client = requestQueryClient()
  await Promise.all([
    client.prefetchQuery({ ...medicinesQuery(), queryFn: () => medicines.list() }),
    client.prefetchQuery({
      ...scheduleSnapshotQuery(),
      queryFn: async () => {
        const data = await schedules.snapshot()
        seedUnscheduledDay(client, data.today.date, data.unscheduledDoses)
        return toScheduleSnapshot(data)
      },
    }),
  ])
  return dehydrate(client)
}

/**
 * Reads Medications' medicines and schedules together, as Today does. `complete` says both reads
 * succeeded, so the browser can reuse them; a failed read is left out for the browser to retry.
 */
export async function prefetchMedications() {
  const state = await prefetchToday()
  const client = requestQueryClient()
  const complete = [medicineKeys.list(), scheduleKeys.snapshot()].every(
    (queryKey) => client.getQueryState(queryKey)?.status === 'success',
  )
  return { state, complete }
}

/**
 * Reads one History date's doses, its Unscheduled doses and the medicines together into the request's Query client.
 * A failed read is left out, so the browser reads it itself and shows History's error and retry.
 */
export async function prefetchHistory(date: string) {
  const client = requestQueryClient()
  await Promise.all([
    client.prefetchQuery({ ...medicinesQuery(), queryFn: () => medicines.list() }),
    client.prefetchQuery({
      ...historyDayQuery(date),
      queryFn: async () => {
        const { doses, unscheduledDoses } = await schedules.historySnapshot(date)
        seedUnscheduledDay(client, date, unscheduledDoses)
        return doses
      },
    }),
  ])
  return dehydrate(client)
}
