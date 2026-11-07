import type { Page } from '@playwright/test'

/** The app API path of a browser request (`/api/schedules`), or undefined for anything else. */
export function apiPath(url: string, origin: string) {
  const parsed = new URL(url)
  if (parsed.origin !== new URL(origin).origin) return undefined
  return parsed.pathname === '/api' || parsed.pathname.startsWith('/api/')
    ? parsed.pathname
    : undefined
}

export type ApiRequestCounter = {
  /** Requests the browser started to `path` since the counter started or was last reset. */
  count(path: string): number
  /** Every counted path with its request count. */
  counts(): Record<string, number>
  /** Start counting from zero, for example just before a client navigation. */
  reset(): void
}

/**
 * Count the browser's requests per app API path, any method. Server reads go from Next.js to the
 * Worker and never appear here, so a zero count after load proves the client reused the data the
 * server rendered (hydration reuse) instead of fetching it again. A count can only prove absence
 * for requests started by the time it is read: read it after the content is visible and the page
 * has hydrated.
 */
export function countApiRequests(page: Page, origin: string): ApiRequestCounter {
  let counts: Record<string, number> = {}
  page.on('request', (request) => {
    const path = apiPath(request.url(), origin)
    if (path) counts[path] = (counts[path] ?? 0) + 1
  })
  return {
    count: (path) => counts[path] ?? 0,
    counts: () => ({ ...counts }),
    reset: () => {
      counts = {}
    },
  }
}
