'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { sessionSaves } from './session-saves'

/** The form observes a session-owned save; unmounting only removes the observer. */
export function useSessionSave<T>(key: string, onSaved?: (saved: T) => void) {
  const store = sessionSaves(useQueryClient())
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const attempt = store.entries.get(key)
  const handled = useRef<unknown>(undefined)
  useEffect(() => {
    store.observers.set(key, (store.observers.get(key) ?? 0) + 1)
    store.emit()
    return () => {
      store.observers.set(key, (store.observers.get(key) ?? 1) - 1)
      store.emit()
    }
  }, [store, key])
  useEffect(() => {
    if (onSaved && attempt?.result?.saved && handled.current !== attempt) {
      handled.current = attempt
      onSaved(attempt.result.saved as T)
      store.clear(key)
    }
  }, [attempt, key, onSaved, store])
  return {
    store,
    attempt,
    pending: attempt?.status === 'pending',
    problem: attempt?.result?.problem,
  }
}
