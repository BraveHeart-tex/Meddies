'use client'

import { useSyncExternalStore } from 'react'

function subscribeOnline(notify: () => void) {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
  }
}

/**
 * Known offline: only when the browser reports no network. Writes then show a
 * disabled "Connect to save" with an Alert; they are never queued.
 */
export function useKnownOffline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => !navigator.onLine,
    () => false,
  )
}
