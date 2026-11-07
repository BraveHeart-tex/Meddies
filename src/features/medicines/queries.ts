import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query'
import { parseMedicine, type Medicine } from './contract'

/** Shared medicine query keys. Mutations update and reconcile these exact keys. */
export const medicineKeys = {
  all: ['medicines'] as const,
  list: () => [...medicineKeys.all, 'list'] as const,
}

/** Browser read of the owner's medicines through the authenticated API route. */
export async function fetchMedicines(signal?: AbortSignal): Promise<Medicine[]> {
  const timeout = AbortSignal.timeout(12000)
  const response = await fetch('/api/medicines', {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new Error('medicines_read_failed')
  const data: { medicines: unknown[] } = await response.json()
  return data.medicines.map(parseMedicine)
}

export const medicinesQuery = () =>
  queryOptions({
    queryKey: medicineKeys.list(),
    queryFn: ({ signal }) => fetchMedicines(signal),
    // Medicines are immutable and cannot be deleted yet. A stale list cannot erase a save.
    structuralSharing: (old, next) => {
      const current = old as Medicine[] | undefined
      const incoming = next as Medicine[]
      return current
        ? [
            ...incoming,
            ...current.filter((item) => !incoming.some((value) => value.id === item.id)),
          ]
        : incoming
    },
  })

/**
 * Reads the cached medicines. Cached content stays on screen while it refreshes; loading and
 * load error apply only until the session has a list (FE-666).
 */
export function useMedicines() {
  const read = useQuery(medicinesQuery())
  const hasMedicines = read.data !== undefined
  const loadError = !hasMedicines && read.isError && !read.isFetching
  return {
    medicines: read.data ?? [],
    loading: !hasMedicines && !loadError,
    loadError,
    /** A refresh failed; the cached list stays on screen with a recoverable alert. */
    refreshFailed: hasMedicines && read.isError,
    refreshing: read.isFetching,
    retry: () => void read.refetch(),
  }
}

/** A confirmed save replaces or appends that medicine in the cached list. */
export function withSavedMedicine(list: Medicine[] | undefined, medicine: Medicine) {
  return [...(list ?? []).filter((item) => item.id !== medicine.id), medicine]
}

/** Cancel reads begun before confirmation, publish the saved medicine, then reconcile. */
export async function confirmMedicine(
  client: QueryClient,
  medicine: Medicine,
  active = () => true,
) {
  await client.cancelQueries({ queryKey: medicineKeys.all })
  if (!active()) return
  client.setQueryData<Medicine[]>(medicineKeys.list(), (list) => withSavedMedicine(list, medicine))
  void client.invalidateQueries({ queryKey: medicineKeys.all })
}
