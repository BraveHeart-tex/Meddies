import { toast } from '@/components/ui/toast'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { istanbulDate, type DailySchedule } from './contract'
import { scheduleToday } from './occurrences'
import { doseWhen, firstDoseAfterResume } from './resume'

/**
 * Medication detail and Medications save confirmations as Toasts (#377): each keeps the text
 * its inline Alert had. The check marks a save, resume or restore; a pause, stop or deletion shows
 * no glyph (DESIGN.md). The Toast host sets how long each stays (#378).
 */
function show(title: string, glyph: 'check' | 'none', description?: string) {
  toast.add({
    title,
    description,
    type: glyph === 'check' ? 'success' : undefined,
  })
}

/** The first dose from the server's save instant, so earlier times today never count. */
function firstDoseLine(schedule: DailySchedule) {
  const first = scheduleToday([schedule], new Date(schedule.confirmedAt), []).next
  if (!first) return undefined
  const today = istanbulDate(new Date(schedule.confirmedAt))
  const day =
    istanbulDate(new Date(first.dueAt)) === today ? 'today' : formatShortDay(first.dueAt, today)
  return `${schedule.basedOnId ? 'Next dose' : 'First dose'}: ${day} at ${formatTime(first.dueAt)}.`
}

export function confirmScheduleSaved(label: string, schedule: DailySchedule) {
  show(`Schedule saved for ${label}.`, 'check', firstDoseLine(schedule))
}

export function confirmMedicationSaved(label: string) {
  show(`${label} saved.`, 'check')
}

export function confirmPaused(label: string) {
  show(`Schedule paused for ${label}.`, 'none', 'No doses expected until you resume.')
}

/** The next dose, or none left (233·A7, A8, A13). */
export function confirmResumed(label: string, schedule: DailySchedule) {
  const today = istanbulDate(new Date(schedule.confirmedAt))
  const next = firstDoseAfterResume(schedule, schedule.confirmedAt)
  show(
    `Schedule resumed for ${label}.`,
    'check',
    next
      ? `Next dose: ${doseWhen(next, today)}.`
      : `No more doses are due.${schedule.endDate === today ? ' Today is its Last day.' : ''}`,
  )
}

export function confirmStopped(label: string, schedule: DailySchedule) {
  show(
    `Schedule stopped for ${label}.`,
    'none',
    schedule.stoppedAt ? `No more doses after ${formatTime(schedule.stoppedAt)} today.` : undefined,
  )
}

export function confirmRestored(label: string) {
  show(`${label} restored`, 'check', 'No schedule has restarted. Set one when you’re ready.')
}

export function confirmDeleted(label: string) {
  show(`${label} deleted`, 'none', 'This medication had no schedule or doses.')
}

export function confirmRecordSaved(kind: 'fix' | 'strength' | 'type') {
  show(
    kind === 'type'
      ? 'Details saved'
      : kind === 'fix'
        ? 'Fixed details saved'
        : 'Strength change saved',
    'check',
  )
}
