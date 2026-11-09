import { useCallback, useSyncExternalStore } from 'react'
import { hashKey, notifyManager, useQueryClient, type QueryKey } from '@tanstack/react-query'

/**
 * The session cache's data for `queryKey`, watched without creating the query, so it never
 * starts a read or delays a streamed section's hydration. Hydration renders undefined, as the
 * server did; cached data appears right after.
 */
export function useCachedQueryData<T>(queryKey: QueryKey): T | undefined {
  const client = useQueryClient()
  const queryHash = hashKey(queryKey)
  return useSyncExternalStore(
    useCallback(
      (onChange) => {
        // Queries can be created during render. Match Query's React observers by scheduling
        // notifications, so a streamed section cannot synchronously update the shell.
        const notify = notifyManager.batchCalls(onChange)
        return client.getQueryCache().subscribe((event) => {
          if (event.query.queryHash === queryHash) notify()
        })
      },
      [client, queryHash],
    ),
    () => client.getQueryData<T>(queryKey),
    () => undefined,
  )
}
