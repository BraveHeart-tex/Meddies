'use client'

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DoseOccurrence, DoseOutcomeRecord } from './contract'
import {
  doseSaveKey,
  doseSaves,
  type AttemptForm,
  type DoseSave,
  type PinnedCorrection,
  type RecordCheck,
} from './dose-saves'

type Outcome = DoseOutcomeRecord['outcome']

/** The session's dose saves, re-rendering on every change. */
export function useDoseSaves() {
  const store = doseSaves(useQueryClient())
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  return store
}

/**
 * Observes one occurrence's session-owned save (FE-674). Unmounting or closing the drawer never
 * cancels it; the latest mount's callbacks receive its result.
 */
export function useDoseOutcomeMutation({
  dose,
  medicine,
  refresh,
  onRecorded,
  onFinished,
  checkRecorded,
  drawerOpen,
}: {
  drawerOpen: boolean
  dose: DoseOccurrence
  medicine: DoseSave['medicine']
  refresh: () => Promise<boolean>
  checkRecorded?: () => Promise<RecordCheck>
  onRecorded: (record: DoseOutcomeRecord) => void
  onFinished: () => void
}) {
  const store = useDoseSaves()
  const key = doseSaveKey(dose)
  const save = store.entries.get(key)
  const pinnedCorrection = useRef<PinnedCorrection | null>(null)

  useLayoutEffect(() => {
    store.effects.set(key, { refresh, checkRecorded, onRecorded })
  })
  useEffect(() => store.observe(key), [store, key])
  useEffect(() => (drawerOpen ? store.openDrawer(key) : undefined), [store, key, drawerOpen])
  // Closes only for results that arrive while this mount watches, never on remount.
  const finished = store.finished.get(key) ?? 0
  const seen = useRef(finished)
  const finish = useRef(onFinished)
  useLayoutEffect(() => {
    finish.current = onFinished
  })
  useEffect(() => {
    if (seen.current === finished) return
    seen.current = finished
    finish.current()
  }, [finished])

  const needsReview = save?.needsReview ?? false
  const problem = save?.problem ?? null
  // An unconfirmed attempt keeps its problem until retried, reconciled or reviewed (D13).
  const uncertain = problem?.kind === 'uncertain' && !!save?.attempt
  return {
    submit(outcome: Outcome, details: Record<string, unknown>, form?: AttemptForm) {
      store.effects.set(key, { refresh, checkRecorded, onRecorded })
      return store.submit(key, {
        dose,
        outcome,
        details,
        form,
        medicine,
        // After a remount, an unconfirmed correction retries with its own preconditions.
        correction: pinnedCorrection.current ?? (uncertain ? (save?.correction ?? null) : null),
      })
    },
    saving: save?.pending ?? false,
    error: save?.error ?? '',
    needsReview,
    problem,
    /** The attempt a reopened drawer restores, with its outcome and form values (D13, F6). */
    attempt: save?.attempt ? { outcome: save.attempt.payload.outcome, form: save.form } : null,
    clearFeedback() {
      if (uncertain) return
      store.update(key, { error: '', problem: null, needsReview: false })
    },
    clearError() {
      if (uncertain) return
      store.update(key, { error: '', problem: null })
    },
    dismissReview() {
      store.update(key, { needsReview: false })
    },
    /** Explicit review ends recovery only after the user has seen the current outcome. */
    reviewCurrent() {
      pinnedCorrection.current = null
      store.set(key, undefined)
      onFinished()
    },
    pinCorrection(correction: PinnedCorrection | null) {
      pinnedCorrection.current = correction
    },
    resetRetry() {
      store.discard(key)
    },
  }
}
