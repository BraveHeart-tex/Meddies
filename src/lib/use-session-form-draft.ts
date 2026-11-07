'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { FieldValues, UseFormReturn } from 'react-hook-form'

// Separate from query data and RHF. The session client scopes ownership, without a GC timer
// or browser storage; dropping that client also makes its drafts collectable.
const drafts = new WeakMap<QueryClient, Map<string, unknown>>()

export function discardSessionFormDraft(client: QueryClient, key: string) {
  drafts.get(client)?.delete(key)
}

/** Non-form draft values, such as which outcome an open drawer had chosen. */
export function readSessionDraft<T>(client: QueryClient, key: string) {
  return drafts.get(client)?.get(key) as T | undefined
}
export function writeSessionDraft(client: QueryClient, key: string, value: unknown) {
  let store = drafts.get(client)
  if (!store) {
    store = new Map()
    drafts.set(client, store)
  }
  store.set(key, structuredClone(value))
}

/** Preserve raw editing values, including incomplete fields, until save or explicit discard. */
export function useSessionFormDraft<T extends FieldValues, O extends FieldValues>(
  /** Null keeps no draft. */
  key: string | null,
  form: UseFormReturn<T, unknown, O>,
) {
  const client = useQueryClient()
  const defaults = useRef(JSON.stringify(form.getValues()))
  const [restored, setRestored] = useState(() =>
    key === null ? false : (drafts.get(client)?.has(key) ?? false),
  )

  useEffect(() => {
    if (key === null) return
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
      if (key !== null) drafts.get(client)?.delete(key)
      setRestored(false)
    },
  }
}
