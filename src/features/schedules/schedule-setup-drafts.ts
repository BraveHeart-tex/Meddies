import type { QueryClient } from '@tanstack/react-query'
import { discardSessionFormDraft, readSessionDraft, writeSessionDraft } from '@/lib/session-drafts'
import type { DailySchedule } from './contract'

export type ScheduleKind = 'times' | 'interval'

// One save per medicine, so the Clock schedule draft keeps the save's key.
export const scheduleSetupKey = (medicineId: string) => `schedule:setup:${medicineId}`
// A change is keyed by the Schedule version it edits, so a newer version starts clean.
export const scheduleChangeKey = (scheduleId: string) => `schedule:change:${scheduleId}`

/** The save and Clock schedule draft key: first setup, or a change to `current`. */
export const scheduleDraftBase = (medicineId: string, current?: DailySchedule) =>
  current ? scheduleChangeKey(current.id) : scheduleSetupKey(medicineId)
export const intervalDraftKey = (base: string) => `${base}:interval`
const kindKey = (base: string) => `${base}:kind`

/** The kind a schedule form opens on: the current Schedule version's, or Set times. */
export const scheduleKindOf = (current?: DailySchedule): ScheduleKind =>
  current?.intervalHours != null ? 'interval' : 'times'

export function readScheduleKind(
  client: QueryClient,
  base: string,
  fallback: ScheduleKind,
): ScheduleKind {
  return readSessionDraft<ScheduleKind>(client, kindKey(base)) ?? fallback
}

export function writeScheduleKind(
  client: QueryClient,
  base: string,
  kind: ScheduleKind,
  fallback: ScheduleKind,
) {
  if (kind === fallback) discardSessionFormDraft(client, kindKey(base))
  else writeSessionDraft(client, kindKey(base), kind)
}

/**
 * Drafts exist only while values differ from the defaults, so this is what "edited" means. A
 * change also counts a switched kind; first setup doesn't, as nothing is entered yet.
 */
export function hasScheduleEdits(client: QueryClient, base: string, change: boolean) {
  return [base, intervalDraftKey(base), ...(change ? [kindKey(base)] : [])].some(
    (key) => readSessionDraft(client, key) !== undefined,
  )
}

export function discardScheduleDrafts(client: QueryClient, base: string) {
  for (const key of [base, intervalDraftKey(base), kindKey(base)])
    discardSessionFormDraft(client, key)
}
