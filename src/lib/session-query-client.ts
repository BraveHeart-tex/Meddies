import { focusManager, QueryClient } from '@tanstack/react-query'

// Query refreshes stale reads when the page becomes visible; also treat window focus as
// returning, like the session check and Today do (FE-666).
focusManager.setEventListener((onFocus) => {
  if (typeof window === 'undefined') return
  const listener = () => onFocus()
  window.addEventListener('visibilitychange', listener)
  window.addEventListener('focus', listener)
  return () => {
    window.removeEventListener('visibilitychange', listener)
    window.removeEventListener('focus', listener)
  }
})

/**
 * Freshness defaults for private reads (FE-666). Cached content stays on screen while a stale
 * query refreshes on screen entry, focus or reconnect. No polling; failures surface at once so
 * the screen can offer a retry instead of waiting through silent backoff.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 30 * 60_000,
        refetchOnMount: true,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchInterval: false,
        retry: false,
      },
    },
  })
}

let current: { key: string; client: QueryClient } | null = null

/**
 * The browser's Query client for one authenticated session, kept across route navigation.
 * A different session key ends the previous session first, so its cache never leaks.
 */
export function sessionQueryClient(key: string) {
  if (current?.key === key) return current.client
  endSessionQueryClient()
  current = { key, client: createQueryClient() }
  return current.client
}

/** Cancels in-flight reads so late responses cannot repopulate, then drops the cache. */
export function endSessionQueryClient() {
  if (!current) return
  const { client } = current
  current = null
  const queries = client.getQueryCache().getAll()
  // A cancelled fetch reschedules garbage collection on its settled query; drop that timer too.
  void client.cancelQueries().finally(() => queries.forEach((query) => query.destroy()))
  client.getMutationCache().clear()
  client.clear()
}
