'use client'

import { useEffect, useState, type ReactNode } from 'react'

/** Hide authenticated content at absolute expiry, including after returning to a backgrounded tab. */
export function SessionBoundary({ expires, children }: { expires: string; children: ReactNode }) {
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    const expire = () => {
      setExpired(true)
      const current = `${window.location.pathname}${window.location.search}`
      const knownTarget = ['/', '/history', '/medications', '/settings'].includes(
        window.location.pathname,
      )
      window.location.replace(
        `/?reason=expired&returnTo=${encodeURIComponent(knownTarget ? current : '/')}`,
      )
    }
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
  return expired ? <p role="status">Your session ended. Please sign in again.</p> : children
}
