// Browser read of one medication's Dose history (#388), in pages through `/api/dose-history`.
// Freshness: stale at once, like History dates, so screen entry, focus and reconnect refresh the
// loaded pages while they stay on screen. No polling and no server prefetch. A confirmed dose save,
// Unscheduled log, change or removal invalidates every medication's pages (`doseHistoryKeys.all`);
// pending saves never write here, Dose history overlays them (`view.ts`).
import { infiniteQueryOptions } from '@tanstack/react-query'
import { PrivateReadError } from '@/lib/session-check'
import { parseDoseHistory, type DoseHistory } from './contract'

export const doseHistoryKeys = {
  all: ['dose-history'] as const,
  medicine: (medicineId: string) => ['dose-history', medicineId] as const,
}

export async function fetchDoseHistory(
  medicineId: string,
  before: string | null,
  signal?: AbortSignal,
): Promise<DoseHistory> {
  const params = new URLSearchParams({ medicineId, ...(before ? { before } : {}) })
  const timeout = AbortSignal.timeout(12000)
  const response = await fetch(`/api/dose-history?${params}`, {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new PrivateReadError(response.status)
  return parseDoseHistory(await response.json())
}

/** The first page carries the summary; each next page starts before the last one's oldest day. */
export const doseHistoryQuery = (medicineId: string) =>
  infiniteQueryOptions({
    queryKey: doseHistoryKeys.medicine(medicineId),
    queryFn: ({ pageParam, signal }) => fetchDoseHistory(medicineId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.before,
    staleTime: 0,
  })
