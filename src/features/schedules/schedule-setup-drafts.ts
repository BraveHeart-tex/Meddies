import type { QueryClient } from '@tanstack/react-query'
import { discardSessionFormDraft, readSessionDraft, writeSessionDraft } from '@/lib/session-drafts'

export type ScheduleKind = 'times' | 'interval'

// One save per medicine, so the Clock schedule draft keeps the save's key.
export const scheduleSetupKey = (medicineId: string) => `schedule:setup:${medicineId}`
export const intervalSetupKey = (medicineId: string) => `${scheduleSetupKey(medicineId)}:interval`
const kindKey = (medicineId: string) => `${scheduleSetupKey(medicineId)}:kind`

export function readScheduleKind(client: QueryClient, medicineId: string): ScheduleKind {
  return readSessionDraft<ScheduleKind>(client, kindKey(medicineId)) ?? 'times'
}

export function writeScheduleKind(client: QueryClient, medicineId: string, kind: ScheduleKind) {
  if (kind === 'times') discardSessionFormDraft(client, kindKey(medicineId))
  else writeSessionDraft(client, kindKey(medicineId), kind)
}

/** Drafts exist only while values differ from the defaults, so this is what "edited" means. */
export function hasScheduleSetupEdits(client: QueryClient, medicineId: string) {
  return [scheduleSetupKey(medicineId), intervalSetupKey(medicineId)].some(
    (key) => readSessionDraft(client, key) !== undefined,
  )
}

export function discardScheduleSetupDrafts(client: QueryClient, medicineId: string) {
  for (const key of [
    scheduleSetupKey(medicineId),
    intervalSetupKey(medicineId),
    kindKey(medicineId),
  ])
    discardSessionFormDraft(client, key)
}
