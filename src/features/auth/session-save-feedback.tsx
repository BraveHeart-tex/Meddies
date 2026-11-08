'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { sessionSaves } from '@/lib/session-saves'

/** Each route observes the same session saves. Toast identity survives the host's remount. */
export function SessionSaveFeedback() {
  const store = sessionSaves(useQueryClient())
  const version = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const router = useRouter()
  useEffect(() => {
    store.setToastDismiss((id) => toast.close(id))
    for (const [key, attempt] of store.entries) {
      const existing = store.toasts.get(key)
      if (store.observers.get(key)) {
        if (existing) toast.close(existing)
        store.toasts.delete(key)
        continue
      }
      if (store.notified.get(key) === attempt) continue
      const pending = attempt.status === 'pending'
      const saved = attempt.result?.saved as { id: string } | undefined
      const schedule = attempt.kind === 'schedule'
      const title = pending
        ? `Saving ${schedule ? 'schedule for ' : ''}${attempt.label}…`
        : saved
          ? schedule
            ? `Schedule saved for ${attempt.label}`
            : `${attempt.label} saved`
          : `${attempt.label}${schedule ? ' schedule' : ''} might not have saved`
      const href = saved
        ? (attempt.openHref ?? `/medications?medicine=${encodeURIComponent(saved.id)}`)
        : attempt.href
      const options = {
        title,
        type: pending ? 'loading' : saved ? 'success' : 'warning',
        timeout: saved ? 8000 : 0,
        actionProps: {
          children: saved ? 'Open' : 'Return to form',
          onClick: () => {
            const id = store.toasts.get(key)
            if (id) toast.close(id)
            store.toasts.delete(key)
            router.push(href)
          },
        },
      }
      if (existing) toast.update(existing, options)
      else store.toasts.set(key, toast.add(options))
      if (!pending) store.notified.set(key, attempt)
      if (saved) store.clear(key)
    }
  }, [router, store, version])
  return null
}
