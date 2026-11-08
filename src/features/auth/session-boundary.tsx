'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { EntryFocus } from './entry-focus'
import { endSession, onSessionEnded, type SessionEnded } from './session-end'
import { SessionSaveFeedback } from './session-save-feedback'
import { SignInScreen } from './sign-in-screen'
import { isServer, QueryClientProvider } from '@tanstack/react-query'
import { confirmSessionEnd } from '@/lib/session-check'
import { createQueryClient, sessionQueryClient } from '@/lib/session-query-client'

/**
 * Replaces authenticated content with sign-in at session end: the absolute deadline without a
 * request, and a server-confirmed end when the page returns. Reads and saves confirm their own 401s.
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
  const [ended, setEnded] = useState<SessionEnded | null>(null)
  // Each page mounts its own boundary; the browser registry hands every mount the same client.
  // Expiry is absolute, so the key stays stable for the whole session.
  const [client] = useState(() =>
    isServer ? createQueryClient() : sessionQueryClient(`${ownerId}:${expires}`),
  )
  useEffect(() => onSessionEnded(setEnded), [])
  useEffect(() => {
    const expire = () => endSession('expired')
    // Session lifetime is real time by design, never the scheduling clock journeys freeze.
    const deadline = new Date(expires).getTime()
    const timer = window.setTimeout(expire, Math.max(0, deadline - Date.now()))
    function check() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() >= deadline) return expire()
      void confirmSessionEnd()
    }
    window.addEventListener('focus', check)
    window.addEventListener('pageshow', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', check)
      window.removeEventListener('pageshow', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [expires])
  return ended ? (
    <SignInScreen
      configured
      reason={ended.reason}
      returnTo={ended.returnTo}
      saveInProgress={ended.saveInProgress}
    />
  ) : (
    <QueryClientProvider client={client}>
      <EntryFocus />
      <SessionSaveFeedback />
      {children}
    </QueryClientProvider>
  )
}
