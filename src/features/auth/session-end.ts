import { toast } from '@/components/ui/toast'
import { whenSessionEndConfirmed } from '@/lib/session-check'
import { activeSessionQueryClient, endSessionQueryClient } from '@/lib/session-query-client'
import { sessionSaves } from '@/lib/session-saves'
import { safeReturnTo, saveInProgressNotice } from './return-to'

export type SessionEndReason = 'expired' | 'signed-out'
export type SessionEnded = { reason: SessionEndReason; returnTo: string; saveInProgress: boolean }

const listeners = new Set<(ended: SessionEnded) => void>()

/** Replaces authenticated content the moment the session ends. */
export function onSessionEnded(listener: (ended: SessionEnded) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The one session end path. Clears all private browser state, keeping only whether a save
 * was outstanding, then replaces the page with sign-in. Expiry keeps the current supported
 * location; sign-out starts the next session on Today.
 */
export function endSession(reason: SessionEndReason) {
  const client = activeSessionQueryClient()
  if (!client) return
  const saveInProgress = sessionSaves(client).outstanding().length > 0
  endSessionQueryClient()
  toast.close()
  const { pathname, search } = window.location
  const returnTo = reason === 'signed-out' ? '/' : safeReturnTo(`${pathname}${search}`)
  listeners.forEach((listener) => listener({ reason, returnTo, saveInProgress }))
  const notice = saveInProgress ? `&notice=${saveInProgressNotice}` : ''
  const href = `/?reason=${reason}&returnTo=${encodeURIComponent(returnTo)}${notice}`
  // A reload also drops the router's cached pages, but needs the network; expiry must not.
  if (navigator.onLine) window.location.replace(href)
  else window.history.replaceState(null, '', href)
}

whenSessionEndConfirmed(() => endSession('expired'))
