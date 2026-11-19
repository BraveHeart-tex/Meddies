import type { DoseOccurrence, DoseRecord } from '@/features/schedules/contract'
import { scheduleHistoryDay } from '@/features/schedules/occurrences'
import type { QueryFixtures } from '../fixture-query'
import { ironSchedule, NOW, routine, salbutamolSchedule, TODAY } from '../lab-fixtures'

/** #382 Snooze: the approved drawer states (382·C1 to 382·C4), over Today. */

const schedules = routine.snapshot.schedules
const takenToday = routine.snapshot.records.filter((record) => record.dueAt.startsWith(TODAY))
const yesterday = routine.snapshot.records.filter((record) => !record.dueAt.startsWith(TODAY))

function todayFixtures(now: string, records: DoseRecord[]): QueryFixtures {
  return {
    now,
    medicines: routine.medicines,
    snapshot: { schedules, records: [...yesterday, ...records], now, date: TODAY },
    history: { [TODAY]: scheduleHistoryDay(schedules, TODAY, new Date(now), records) },
    quietHours: { quietHours: true },
  }
}

function doseAt(fixtures: QueryFixtures, scheduleId: string, dueAt: string): DoseOccurrence {
  const dose = fixtures.history?.[TODAY]?.find(
    (occurrence) => occurrence.scheduleId === scheduleId && occurrence.dueAt === dueAt,
  )
  if (!dose) throw new Error(`No lab dose at ${dueAt}`)
  return dose
}

/** 10:00: Salbutamol's 09:00 dose is Not logged, 60 minutes in, so Snooze is open. */
const morningRecords = takenToday.filter(
  (record) =>
    !(record.scheduleId === salbutamolSchedule.id && record.dueAt.endsWith('06:00:00.000Z')),
)
export const morning = todayFixtures(NOW, morningRecords)
export const morningDose = doseAt(morning, salbutamolSchedule.id, '2026-11-09T06:00:00.000Z')
/** Accepted at 10:00, so the snooze targets 10:40. */
export const morningReminder = '2026-11-09T07:40:00.000Z'

/**
 * 22:30: Iron's 22:00 dose is Not logged with Quiet hours on. A snooze accepted now targets 23:10,
 * inside 23:00-08:00, so it gives no reminder (#9 Quiet target). Every earlier dose is taken.
 */
const LATE = '2026-11-09T19:30:00.000Z'
const lateRecords: DoseRecord[] = [
  ...takenToday,
  ...scheduleHistoryDay(schedules, TODAY, new Date(LATE), takenToday)
    .filter((dose) => dose.status === 'Not logged' && dose.scheduleId !== ironSchedule.id)
    .map((dose) => ({
      outcome: 'Taken' as const,
      scheduleId: dose.scheduleId,
      dueAt: dose.dueAt,
      takenAt: new Date(Date.parse(dose.dueAt) + 5 * 60_000).toISOString(),
      quantity: dose.quantity,
      revision: 1,
    })),
]
export const late = todayFixtures(LATE, lateRecords)
export const lateDose = doseAt(late, ironSchedule.id, '2026-11-09T19:00:00.000Z')
export const lateTarget = '2026-11-09T20:10:00.000Z'

export type SnoozeState = 'available' | 'snoozed' | 'quiet' | 'rejected'

/** Wording for every Snooze state, including the variants that share a frame's slot. */
export const snoozeCopy = {
  action: 'Snooze 40 min',
  saving: 'Snoozing...',
  offline: "You're offline. Reconnect to snooze.",
  connect: 'Connect to snooze',
  retry: 'Try snoozing again',
  quietTitle: 'No reminder',
  quietBody: (time: string) => `${time} is in quiet hours.`,
  rejected: {
    notificationsOff: 'Turn on notifications to snooze.',
    exhausted: 'No reminders are left for this dose.',
    tooLate: "It's too late to snooze this dose.",
    alreadySnoozed: 'This dose is already snoozed.',
  },
  settings: 'Open Settings',
} as const
