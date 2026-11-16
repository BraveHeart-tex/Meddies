import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { sessionSaves } from '@/lib/session-saves'
import { PrivateReadError } from '@/lib/session-check'
import { parseMedicineResponse, type Medicine } from './contract'

/** Shared medicine query keys. Mutations update and reconcile these exact keys. */
export const medicineKeys = {
  all: ['medicines'] as const,
  list: () => [...medicineKeys.all, 'list'] as const,
}

/** Confirmed deletion IDs outlive list garbage collection, scoped to this session client.
 * Every read, hydration and receipt publication filters them; absence never creates one.
 */
const deletions = new WeakMap<QueryClient, Set<string>>()
export function mergeClientMedicines(
  client: QueryClient,
  current: Medicine[] | undefined,
  incoming: Medicine[],
) {
  const deleted = deletions.get(client)
  return mergeMedicines(current, incoming).filter((medicine) => !deleted?.has(medicine.id))
}

/** Only a matching delete receipt may call this. Cancel older reads before publication. */
export async function confirmMedicineDeletion(
  client: QueryClient,
  medicineId: string,
  active = () => true,
) {
  await client.cancelQueries({ queryKey: medicineKeys.all })
  if (!active() || !sessionSaves(client).active) return
  let deleted = deletions.get(client)
  if (!deleted) {
    deleted = new Set()
    deletions.set(client, deleted)
    sessionSaves(client).onEnd(() => deletions.delete(client))
  }
  deleted.add(medicineId)
  client.setQueryData<Medicine[]>(medicineKeys.list(), (list) =>
    mergeClientMedicines(client, list, []),
  )
  void client.invalidateQueries({ queryKey: medicineKeys.all })
}

/** Browser read of the owner's medicines through the authenticated API route. */
export async function fetchMedicines(signal?: AbortSignal): Promise<Medicine[]> {
  const timeout = AbortSignal.timeout(12000)
  const response = await fetch('/api/medicines', {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new PrivateReadError(response.status)
  const data: { medicines: unknown[] } = await response.json()
  return data.medicines.map(parseMedicineResponse)
}

/** Revisions never move backwards; medicines absent from a stale list stay. */
export function mergeMedicines(current: Medicine[] | undefined, incoming: Medicine[]) {
  return current
    ? [
        ...incoming.map((value) => {
          const prior = current.find((item) => item.id === value.id)
          if (!prior) return value
          const latest = (prior.revision ?? 0) > (value.revision ?? 0) ? prior : value
          // Usage and recorded Taken instants remain true even when a same-revision
          // read or creation receipt predates the first dose/schedule.
          return {
            ...latest,
            ...(prior.everHadSchedule || value.everHadSchedule ? { everHadSchedule: true } : {}),
            ...(prior.everHadDose || value.everHadDose ? { everHadDose: true } : {}),
            ...(prior.latestTakenAt &&
            (!value.latestTakenAt || prior.latestTakenAt > value.latestTakenAt)
              ? { latestTakenAt: prior.latestTakenAt }
              : value.latestTakenAt
                ? { latestTakenAt: value.latestTakenAt }
                : {}),
          }
        }),
        ...current.filter((item) => !incoming.some((value) => value.id === item.id)),
      ]
    : incoming
}

export const medicinesQuery = (client?: QueryClient) =>
  queryOptions({
    queryKey: medicineKeys.list(),
    queryFn: ({ signal }) => fetchMedicines(signal),
    // A stale read cannot undo a confirmed revision or erase a newly created Medicine.
    structuralSharing: (old, next) =>
      client
        ? mergeClientMedicines(client, old as Medicine[] | undefined, next as Medicine[])
        : mergeMedicines(old as Medicine[] | undefined, next as Medicine[]),
  })

/**
 * Reads the cached medicines. Cached content stays on screen while it refreshes; loading and
 * load error apply only until the session has a list (#119).
 */
export function useMedicines({ serverEntry = false }: { serverEntry?: boolean } = {}) {
  const client = useQueryClient()
  const read = useQuery({ ...medicinesQuery(client), refetchOnMount: !serverEntry })
  const hasMedicines = read.data !== undefined
  const loadError = !hasMedicines && read.isError && !read.isFetching
  return {
    medicines: read.data ?? [],
    loading: !hasMedicines && !loadError,
    loadError,
    /** A refresh failed; the cached list stays on screen with a recoverable alert. */
    refreshFailed: hasMedicines && read.isError,
    refreshing: read.isFetching,
    /** When the cached list last read successfully. */
    updatedAt: read.dataUpdatedAt,
    retry: () => void read.refetch(),
  }
}

export type MedicinesRead = ReturnType<typeof useMedicines>

/** A confirmed save replaces or appends that medicine in the cached list. */
export function withSavedMedicine(list: Medicine[] | undefined, medicine: Medicine) {
  return mergeMedicines(list, [medicine])
}

/** Cancel reads begun before confirmation, publish the saved medicine, then reconcile. */
export async function confirmMedicine(
  client: QueryClient,
  medicine: Medicine,
  active = () => true,
) {
  await client.cancelQueries({ queryKey: medicineKeys.all })
  if (!active() || !sessionSaves(client).active) return
  client.setQueryData<Medicine[]>(medicineKeys.list(), (list) =>
    mergeClientMedicines(client, list, [medicine]),
  )
  void client.invalidateQueries({ queryKey: medicineKeys.all })
}
