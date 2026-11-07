'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { isServer, QueryClientProvider } from '@tanstack/react-query'
import {
  createQueryClient,
  endSessionQueryClient,
  sessionQueryClient,
} from '@/lib/session-query-client'

/**
 * Hide authenticated content at absolute expiry, including after returning to a backgrounded tab.
 * Provides the session's Query client: one per server request, one per browser session.
 */
export function SessionBoundary({
  ownerId,
  expires,
  children,
}: {
  ownerId: string
  expires: string
  children: ReactNode
}) {
  const [expired, setExpired] = useState(false)
  // Each page mounts its own boundary; the browser registry hands every mount the same client.
  // Expiry is absolute, so the key stays stable for the whole session.
  const [client] = useState(() =>
    isServer ? createQueryClient() : sessionQueryClient(`${ownerId}:${expires}`),
  )
  useEffect(() => {
    const expire = () => {
      setExpired(true)
      endSessionQueryClient()
      const current = `${window.location.pathname}${window.location.search}`
      const knownTarget = ['/', '/history', '/medications', '/settings'].includes(
        window.location.pathname,
      )
      window.location.replace(
        `/?reason=expired&returnTo=${encodeURIComponent(knownTarget ? current : '/')}`,
      )
    }
    // Session lifetime is real time by design, never the scheduling clock journeys freeze.
    const deadline = new Date(expires).getTime()
    const timer = window.setTimeout(expire, Math.max(0, deadline - Date.now()))
    const controller = new AbortController()
    async function check() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() >= deadline) return expire()
      try {
        const response = await fetch('/api/session', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (response.status === 401) expire()
      } catch {
        // Network loss is not proof of sign-out. Server operations still authenticate independently.
      }
    }
    window.addEventListener('focus', check)
    window.addEventListener('pageshow', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearTimeout(timer)
      controller.abort()
      window.removeEventListener('focus', check)
      window.removeEventListener('pageshow', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [expires])
  return expired ? (
    <p role="status">Your session ended. Please sign in again.</p>
  ) : (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}
