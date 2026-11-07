import 'server-only'
import { dehydrate } from '@tanstack/react-query'
import { medicinesQuery } from '@/features/medicines/queries'
import { medicines } from '@/features/medicines/server'
import { requestQueryClient } from '@/lib/request-query-client'
import { historyDayQuery, scheduleSnapshotQuery, toScheduleSnapshot } from './queries'
import { schedules } from './server'

/**
 * Reads Today's medicines and schedules snapshot together into the request's Query client and
 * returns its display-only state for `HydrationBoundary`. A failed read is left out, so the
 * browser reads it itself and shows Today's error and retry.
 */
export async function prefetchToday() {
  const client = requestQueryClient()
  await Promise.all([
    client.prefetchQuery({ ...medicinesQuery(), queryFn: () => medicines.list() }),
    client.prefetchQuery({
      ...scheduleSnapshotQuery(),
      queryFn: async () => toScheduleSnapshot(await schedules.snapshot()),
    }),
  ])
  return dehydrate(client)
}

/**
 * Reads one History date's doses and the medicines together into the request's Query client.
 * A failed read is left out, so the browser reads it itself and shows History's error and retry.
 */
export async function prefetchHistory(date: string) {
  const client = requestQueryClient()
  await Promise.all([
    client.prefetchQuery({ ...medicinesQuery(), queryFn: () => medicines.list() }),
    client.prefetchQuery({ ...historyDayQuery(date), queryFn: () => schedules.history(date) }),
  ])
  return dehydrate(client)
}
