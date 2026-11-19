'use client'
import { useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useKnownOffline } from '@/lib/use-known-offline'
import type { DoseOccurrence } from '../schedules/contract'
import { snoozeKey, snoozeSaves } from './saves'

export function useSnooze(dose: DoseOccurrence, label: string) {
  const store = snoozeSaves(useQueryClient())
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const offline = useKnownOffline()
  const attempt = store.entries.get(snoozeKey(dose))
  return {
    attempt,
    offline,
    submit: () => store.submit(dose, label),
    review: () => store.review(dose),
  }
}
