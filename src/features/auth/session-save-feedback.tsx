'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { showMedicationsView } from '@/features/medicines/medications-nav'
import { medicationsHref } from '@/features/medicines/routes'
import { sessionSaves } from '@/lib/session-saves'

/** Each route observes the same session saves. Toast identity survives the host's remount. */
export function SessionSaveFeedback() {
  const store = sessionSaves(useQueryClient())
  const version = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const router = useRouter()
  useEffect(() => {
    store.setToastDismiss((id) => toast.close(id))
    for (const attempt of store.feedback()) {
      const { key, toast: existing } = attempt
      if (attempt.observed) {
        if (existing) toast.close(existing)
        store.feedbackToast(key)
        continue
      }
      if (attempt.notified) continue
      const pending = attempt.pending
      const saved = attempt.saved
      const schedule = attempt.kind === 'schedule'
      const title = pending
        ? `Saving ${schedule ? 'schedule for ' : ''}${attempt.label}…`
        : saved
          ? (attempt.savedTitle ??
            (schedule ? `Schedule saved for ${attempt.label}` : `${attempt.label} saved`))
          : `${attempt.label}${schedule ? ' schedule' : ''} might not have saved`
      const href = saved
        ? (attempt.openHref ??
          (attempt.savedId
            ? medicationsHref({ mode: 'detail', medicineId: attempt.savedId })
            : attempt.href))
        : attempt.href
      const options = {
        title,
        type: pending ? 'loading' : saved ? 'success' : 'warning',
        timeout: saved ? 8000 : 0,
        actionProps: {
          children: saved ? 'Open' : 'Return to form',
          onClick: () => {
            const id = store.feedback().find((item) => item.key === key)?.toast
            if (id) toast.close(id)
            store.feedbackToast(key)
            // A view change inside Medications needs no server round trip.
            if (window.location.pathname === '/medications' && href.startsWith('/medications'))
              showMedicationsView(href)
            else router.push(href)
          },
        },
      }
      if (existing) toast.update(existing, options)
      else store.feedbackToast(key, toast.add(options))
      if (!pending) store.feedbackHandled(key)
      if (saved) store.clear(key)
    }
  }, [router, store, version])
  return null
}
