'use client'

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AttemptForm } from '../schedules/dose-save-state'
import { useSchedulingClock } from '../schedules/scheduling-clock'
import { istanbulDate } from '../schedules/contract'
import {
  unscheduledSaves,
  type UnscheduledCommand,
  type UnscheduledSave,
} from './unscheduled-saves'

/**
 * Observes one session-owned Unscheduled dose save. Unmounting or closing the drawer never
 * cancels it; `onFinished` runs for results that arrive while this mount watches.
 */
export function useUnscheduledSave(
  key: string,
  {
    medicine,
    onFinished,
  }: {
    medicine: UnscheduledSave['medicine']
    onFinished: () => void
  },
) {
  const store = unscheduledSaves(useQueryClient())
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const clock = useSchedulingClock()
  const save = store.get(key)
  useEffect(() => store.observe(key), [store, key])
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

  const problem = save?.problem ?? null
  return {
    submit(command: UnscheduledCommand, form?: AttemptForm) {
      return store.submit(key, {
        command,
        form,
        medicine,
        today: () => istanbulDate(clock.now()),
      })
    },
    saving: save?.pending ?? false,
    problem,
    conflict: save?.conflict ?? false,
    unconfirmed: problem?.kind === 'uncertain' && !!save?.attempt,
    /** The attempt a reopened drawer restores, with its command and form values. */
    attempt: save?.attempt ? { command: save.attempt.command, form: save.form } : null,
    dismiss: () => store.dismiss(key),
  }
}
