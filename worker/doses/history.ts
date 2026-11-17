// Dose history read (#386). One medication's Taken doses at their latest values: scheduled
// originals without a correction, latest corrections that are Taken (a correction to Skipped
// leaves), and the latest non-removed Unscheduled revision. A dose's day is the Istanbul day of
// its intake time, so a corrected intake time moves it. Pages hold whole days: the day query picks
// `PAGE_DAYS + 1` days to learn whether older ones exist, and the extra day is dropped. An unknown
// or another owner's medication is not found; an Archived medicine reads normally.
import { and, eq, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
  doseTotals,
  type DoseHistory,
  type DoseHistoryDay,
  type DoseHistoryDose,
  type DoseHistoryRequest,
} from '../../src/features/dose-history/contract'
import { istanbulDate, shiftDate } from '../../src/lib/calendar-date'
import { ApplicationError } from '../../src/lib/application-error'
import { userMedications } from '../schema'

export const PAGE_DAYS = 14

type Row = {
  kind: 'scheduled' | 'unscheduled'
  scheduleId: string | null
  dueAt: string | null
  id: string | null
  takenAt: string
  quantity: number
  unit: string
  strength: string | null
  revision: number
  day: string
}

// Istanbul keeps UTC+03:00 all year (src/lib/calendar-date.ts), so SQLite derives the intake day
// with a fixed modifier.
function takenDoses(ownerId: string, medicineId: string) {
  return sql`
    WITH versions AS (
      SELECT id FROM daily_schedules WHERE owner_id = ${ownerId} AND medicine_id = ${medicineId}
    ), medicine AS (
      SELECT unit FROM user_medications WHERE owner_id = ${ownerId} AND id = ${medicineId}
    ), taken AS (
      SELECT 'scheduled' AS kind, r.schedule_id AS scheduleId, r.due_at AS dueAt, NULL AS id,
        r.taken_at AS takenAt, r.quantity, r.unit, r.strength, 0 AS revision
      FROM dose_records r
      WHERE r.owner_id = ${ownerId} AND r.schedule_id IN (SELECT id FROM versions)
        AND NOT EXISTS (
          SELECT 1 FROM dose_corrections c WHERE c.owner_id = r.owner_id
          AND c.schedule_id = r.schedule_id AND c.due_at = r.due_at)
      UNION ALL
      SELECT 'scheduled', c.schedule_id, c.due_at, NULL, c.taken_at, c.quantity, c.unit,
        c.strength, c.revision
      FROM dose_corrections c
      WHERE c.owner_id = ${ownerId} AND c.schedule_id IN (SELECT id FROM versions)
        AND c.outcome = 'Taken'
        AND c.revision = (
          SELECT MAX(latest.revision) FROM dose_corrections latest
          WHERE latest.owner_id = c.owner_id AND latest.schedule_id = c.schedule_id
            AND latest.due_at = c.due_at)
      UNION ALL
      SELECT 'unscheduled', NULL, NULL, u.id, u.taken_at, u.quantity, u.unit, u.strength,
        u.revision
      FROM unscheduled_doses u
      WHERE u.owner_id = ${ownerId} AND u.medicine_id = ${medicineId} AND u.removed = 0
        AND NOT EXISTS (
          SELECT 1 FROM unscheduled_doses latest WHERE latest.owner_id = u.owner_id
          AND latest.id = u.id AND latest.revision > u.revision)
    ), dated AS (
      SELECT kind, scheduleId, dueAt, id, takenAt, quantity,
        COALESCE(taken.unit, (SELECT unit FROM medicine)) AS unit, strength, revision,
        date(takenAt, '+3 hours') AS day
      FROM taken
    )`
}

const newestFirst = sql`ORDER BY takenAt DESC, kind, scheduleId, dueAt, id`

function dose(row: Row): DoseHistoryDose {
  const fields = {
    takenAt: row.takenAt,
    quantity: row.quantity,
    unit: row.unit,
    strength: row.strength,
    revision: row.revision,
  }
  return row.kind === 'scheduled'
    ? {
        kind: 'scheduled',
        scheduleId: row.scheduleId!,
        dueAt: row.dueAt!,
        historyDate: istanbulDate(new Date(row.dueAt!)),
        ...fields,
      }
    : { kind: 'unscheduled', id: row.id!, historyDate: row.day, ...fields }
}

function groupDays(rows: Row[]): DoseHistoryDay[] {
  const days: DoseHistoryDay[] = []
  for (const row of rows) {
    if (days.at(-1)?.date !== row.day) days.push({ date: row.day, doses: [], totals: [] })
    days.at(-1)!.doses.push(dose(row))
  }
  for (const day of days) day.totals = doseTotals(day.doses)
  return days
}

export async function readDoseHistory(
  db: DrizzleD1Database,
  ownerId: string,
  { medicineId, before }: DoseHistoryRequest,
  now: Date,
): Promise<DoseHistory> {
  const medicine = await db
    .select({ id: userMedications.id })
    .from(userMedications)
    .where(and(eq(userMedications.ownerId, ownerId), eq(userMedications.id, medicineId)))
    .get()
  if (!medicine) throw new ApplicationError('not_found', 404)
  const doses = takenDoses(ownerId, medicineId)
  const rows = await db.all<Row>(sql`${doses}
    SELECT * FROM dated WHERE day IN (
      SELECT DISTINCT day FROM dated WHERE ${before === null ? sql`1` : sql`day < ${before}`}
      ORDER BY day DESC LIMIT ${PAGE_DAYS + 1})
    ${newestFirst}`)
  const days = groupDays(rows)
  const more = days.length > PAGE_DAYS
  if (more) days.pop()
  const page = { medicineId, days, before: more ? days.at(-1)!.date : null }
  if (before !== null) return { ...page, summary: null }

  const today = istanbulDate(now)
  const recent = (
    await db.all<Row>(sql`${doses}
      SELECT * FROM dated WHERE day >= ${shiftDate(today, -29)} AND day <= ${today}
      ${newestFirst}`)
  ).map((row) => ({ day: row.day, dose: dose(row) }))
  const since = (from: string) =>
    doseTotals(recent.filter(({ day }) => day >= from).map(({ dose }) => dose))
  return {
    ...page,
    summary: {
      lastDose: days[0]?.doses[0] ?? null,
      today: since(today),
      last7Days: since(shiftDate(today, -6)),
      last30Days: since(shiftDate(today, -29)),
    },
  }
}
