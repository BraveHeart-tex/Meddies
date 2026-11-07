import { useCallback, useSyncExternalStore } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'

/**
 * The session cache's data for `queryKey`, watched without creating the query, so it never
 * starts a read or delays a streamed section's hydration. Hydration renders undefined, as the
 * server did; cached data appears right after.
 */
export function useCachedQueryData<T>(queryKey: QueryKey): T | undefined {
  const client = useQueryClient()
  return useSyncExternalStore(
    useCallback((onChange) => client.getQueryCache().subscribe(onChange), [client]),
    () => client.getQueryData<T>(queryKey),
    () => undefined,
  )
}
