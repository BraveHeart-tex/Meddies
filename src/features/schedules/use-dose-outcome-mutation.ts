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
  type DoseCommand,
} from './dose-saves'

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
  onRecorded,
  onFinished,
  drawerOpen,
  today,
}: {
  drawerOpen: boolean
  /** Istanbul today, read whenever the save needs it. */
  today: () => string
  dose: DoseOccurrence
  medicine: DoseSave['medicine']
  onRecorded: (record: DoseOutcomeRecord, superseded: boolean) => void
  onFinished: () => void
}) {
  const store = useDoseSaves()
  const key = doseSaveKey(dose)
  const save = store.get(key)
  const pinnedCorrection = useRef<PinnedCorrection | null>(null)

  useLayoutEffect(() => {
    store.present(key, onRecorded)
  })
  useEffect(() => store.observe(key), [store, key])
  useEffect(() => (drawerOpen ? store.openDrawer(key) : undefined), [store, key, drawerOpen])
  // Closes only for results that arrive while this mount watches, never on remount.
  const finished = store.completion(key)
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
    submit(command: DoseCommand, form?: AttemptForm) {
      return store.submit(key, {
        dose,
        command,
        onRecorded,
        form,
        medicine,
        today,
        // After a remount, an unconfirmed correction retries with its own preconditions.
        correction: pinnedCorrection.current ?? (uncertain ? (save?.correction ?? null) : null),
      })
    },
    async refresh() {
      const check = await store.checkRecorded(dose, today)
      return typeof check === 'object'
    },
    saving: save?.pending ?? false,
    error: save?.error ?? '',
    needsReview,
    problem,
    /** The attempt a reopened drawer restores, with its outcome and form values (D13, F6). */
    attempt: save?.attempt ? { outcome: save.attempt.payload.outcome, form: save.form } : null,
    clearFeedback() {
      if (uncertain) return
      store.clearFeedback(key)
    },
    clearError() {
      if (uncertain) return
      store.clearError(key)
    },
    dismissReview() {
      store.dismissReview(key)
    },
    /** Explicit review ends recovery only after the user has seen the current outcome. */
    reviewCurrent() {
      pinnedCorrection.current = null
      store.reviewCurrent(key)
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
