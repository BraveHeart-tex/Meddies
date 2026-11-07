import { queryOptions } from '@tanstack/react-query'
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
  })

/** A confirmed save replaces or appends that medicine in the cached list. */
export function withSavedMedicine(list: Medicine[] | undefined, medicine: Medicine) {
  return list && [...list.filter((item) => item.id !== medicine.id), medicine]
}
