import { confirmSessionEnd, PrivateReadError } from './session-check'
import { endSessionDrafts } from './session-drafts'
import { endSessionSaves } from './session-saves'
import { focusManager, QueryCache, QueryClient } from '@tanstack/react-query'

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

/** Once sealed at session end, a retained client reference can no longer store anything. */
class SessionQueryCache extends QueryCache {
  private sealed = false
  seal() {
    this.sealed = true
  }
  add(query: Parameters<QueryCache['add']>[0]) {
    if (!this.sealed) super.add(query)
  }
}

const sessionQueryCache = () =>
  new SessionQueryCache({
    onError: (error) => {
      if (error instanceof PrivateReadError && error.status === 401) void confirmSessionEnd()
    },
  })

/**
 * Freshness defaults for private reads (FE-666). Cached content stays on screen while a stale
 * query refreshes on screen entry, focus or reconnect. No polling; failures surface at once so
 * the screen can offer a retry instead of waiting through silent backoff.
 */
export function createQueryClient(queryCache: QueryCache = sessionQueryCache()) {
  return new QueryClient({
    queryCache,
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

let current: { key: string; client: QueryClient; queryCache: SessionQueryCache } | null = null

/**
 * The browser's Query client for one authenticated session, kept across route navigation.
 * A different session key ends the previous session first, so its cache never leaks.
 */
export function sessionQueryClient(key: string) {
  if (current?.key === key) return current.client
  endSessionQueryClient()
  const queryCache = sessionQueryCache()
  current = { key, client: createQueryClient(queryCache), queryCache }
  return current.client
}

/** The live session's client, or null once it has ended. */
export function activeSessionQueryClient() {
  return current?.client ?? null
}

/** Cancels in-flight reads so late responses cannot repopulate, then drops all private state. */
export function endSessionQueryClient() {
  if (!current) return
  const { client, queryCache } = current
  current = null
  queryCache.seal()
  endSessionDrafts(client)
  endSessionSaves(client)
  const queries = client.getQueryCache().getAll()
  // A cancelled fetch reschedules garbage collection on its settled query; drop that timer too.
  void client.cancelQueries().finally(() => queries.forEach((query) => query.destroy()))
  client.getMutationCache().clear()
  client.clear()
}
