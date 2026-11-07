'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { FieldValues, UseFormReturn } from 'react-hook-form'

// Separate from query data and RHF. The session client scopes ownership, without a GC timer
// or browser storage; dropping that client also makes its drafts collectable.
const drafts = new WeakMap<QueryClient, Map<string, unknown>>()

/** Preserve raw editing values, including incomplete fields, until save or explicit discard. */
export function useSessionFormDraft<T extends FieldValues, O extends FieldValues>(
  key: string,
  form: UseFormReturn<T, unknown, O>,
) {
  const client = useQueryClient()
  const defaults = useRef(JSON.stringify(form.getValues()))
  const [restored, setRestored] = useState(() => drafts.get(client)?.has(key) ?? false)

  useEffect(() => {
    let store = drafts.get(client)
    if (!store) {
      store = new Map()
      drafts.set(client, store)
    }
    const draft = store.get(key) as T | undefined
    if (draft) {
      form.reset(structuredClone(draft))
    }
    const subscription = form.watch(() => {
      const values = form.getValues()
      if (JSON.stringify(values) === defaults.current) store.delete(key)
      else store.set(key, structuredClone(values))
    })
    return () => subscription.unsubscribe()
  }, [client, form, key])

  return {
    restored,
    discard() {
      drafts.get(client)?.delete(key)
      setRestored(false)
    },
  }
}
