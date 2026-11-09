import { useState } from 'react'
import type { Medicine } from '@/features/medicines/contract'
import { nextIntervalDoses } from '@/features/schedules/interval-preview'
import { scheduledInstant } from '@/features/schedules/occurrences'
import { isTimeOfDay } from '@/lib/time-of-day'

/** Saved at 10:00 Istanbul on Monday 9 November, the worked example in FE-764. */
export const NOW = '2026-11-09T07:00:00.000Z'
export const TODAY = '2026-11-09'

export const magnesium: Medicine = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Magnesium',
  strength: '400 mg',
  unit: 'tablet',
}

export type IntervalValues = { hours: string; date: string; time: string; quantity: string }
export type IntervalField = 'hours' | 'date' | 'time'
export type IntervalErrors = Partial<Record<IntervalField, string>>

const blankValues: IntervalValues = { hours: '', date: TODAY, time: '', quantity: '1' }

function fieldProblem(field: IntervalField, { hours, date, time }: IntervalValues) {
  if (field === 'hours') {
    if (!hours) return 'Choose how many hours.'
    if (!/^\d+$/.test(hours)) return 'Use whole hours, like 8.'
    const count = Number(hours)
    return count < 1 || count > 24 ? 'Use 1 to 24 hours.' : undefined
  }
  if (field === 'date') {
    if (!date) return 'Choose a date.'
    return date < TODAY ? 'Choose today or a later date.' : undefined
  }
  return isTimeOfDay(time) ? undefined : 'Choose a time.'
}

const ALL_FIELDS: IntervalField[] = ['hours', 'date', 'time']

function previewDoses(values: IntervalValues) {
  if (ALL_FIELDS.some((field) => fieldProblem(field, values))) return null
  return nextIntervalDoses({
    anchor: scheduledInstant(values.date, values.time),
    hours: Number(values.hours),
    now: NOW,
  })
}

/** Local values for a direction. Nothing here saves; errors clear as their field is edited. */
export function useIntervalDraft(
  initial?: Partial<IntervalValues>,
  initialErrors: IntervalErrors = {},
) {
  const [values, setValues] = useState({ ...blankValues, ...initial })
  const [errors, setErrors] = useState(initialErrors)
  return {
    values,
    errors,
    doses: previewDoses(values),
    update(patch: Partial<IntervalValues>) {
      setValues((previous) => ({ ...previous, ...patch }))
      setErrors((previous) => {
        const next = { ...previous }
        for (const key of Object.keys(patch)) delete next[key as IntervalField]
        return next
      })
    },
    /** Shows the problems of `fields` and reports whether they are all valid. */
    validate(fields: IntervalField[] = ALL_FIELDS) {
      const found: IntervalErrors = {}
      for (const field of fields) {
        const problem = fieldProblem(field, values)
        if (problem) found[field] = problem
      }
      setErrors((previous) => ({ ...previous, ...found }))
      return Object.keys(found).length === 0
    },
  }
}

export type IntervalDraft = ReturnType<typeof useIntervalDraft>

/** What every direction's frames can hold: a starting screen and a frozen state. */
export type IntervalFrameProps = {
  kind?: 'times' | 'interval'
  values?: Partial<IntervalValues>
  errors?: IntervalErrors
}
