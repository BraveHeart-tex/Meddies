'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { FieldValues, UseFormReturn } from 'react-hook-form'
import { discardSessionFormDraft, readSessionDraft, writeSessionDraft } from './session-drafts'

/** Preserve raw editing values, including incomplete fields, until save or explicit discard. */
export function useSessionFormDraft<T extends FieldValues, O extends FieldValues>(
  /** Null keeps no draft. */
  key: string | null,
  form: UseFormReturn<T, unknown, O>,
) {
  const client = useQueryClient()
  const defaults = useRef(JSON.stringify(form.getValues()))
  const [restored, setRestored] = useState(() =>
    key === null ? false : readSessionDraft(client, key) !== undefined,
  )

  useEffect(() => {
    if (key === null) return
    const draft = readSessionDraft<T>(client, key)
    if (draft) form.reset(structuredClone(draft))
    const subscription = form.watch(() => {
      const values = form.getValues()
      if (JSON.stringify(values) === defaults.current) discardSessionFormDraft(client, key)
      else writeSessionDraft(client, key, values)
    })
    return () => subscription.unsubscribe()
  }, [client, form, key])

  return {
    restored,
    discard() {
      if (key !== null) discardSessionFormDraft(client, key)
      setRestored(false)
    },
  }
}
