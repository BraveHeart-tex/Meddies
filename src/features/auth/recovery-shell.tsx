'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'

/** Keep the public 404 synchronous (HTTP 404), then reveal tabs after session validation. */
export function RecoveryShell({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    async function check() {
      try {
        const response = await fetch('/api/session', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) return
        const session = await response.json()
        if (!controller.signal.aborted) setSignedIn(typeof session.id === 'string')
      } catch {
        // Recovery remains usable without a session response; no private data is loaded here.
      }
    }
    void check()
    return () => controller.abort()
  }, [])
  return <AppShell showNavigation={signedIn}>{children}</AppShell>
}
