import {
  sqliteTable,
  text,
  primaryKey,
  unique,
  foreignKey,
  real,
  index,
  check,
  integer,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const userMedications = sqliteTable(
  'user_medications',
  {
    ownerId: text('owner_id').notNull(),
    id: text('id').notNull(),
    label: text('label').notNull(),
    strength: text('strength'),
    unit: text('unit', { enum: ['tablet', 'capsule'] }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.id] })],
)

export const dailySchedules = sqliteTable(
  'daily_schedules',
  {
    ownerId: text('owner_id').notNull(),
    id: text('id').notNull(),
    medicineId: text('medicine_id').notNull(),
    startDate: text('start_date').notNull(),
    times: text('times', { mode: 'json' }).$type<{ time: string; quantity: number }[]>().notNull(),
    confirmedAt: text('confirmed_at').notNull(),
    weekdays: text('weekdays', { mode: 'json' })
      .$type<number[]>()
      .notNull()
      .default([0, 1, 2, 3, 4, 5, 6]),
    endDate: text('end_date'),
    intervalHours: integer('interval_hours'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    unique().on(table.ownerId, table.medicineId),
    foreignKey({
      columns: [table.ownerId, table.medicineId],
      foreignColumns: [userMedications.ownerId, userMedications.id],
    }),
  ],
)

export const doseRecords = sqliteTable(
  'dose_records',
  {
    ownerId: text('owner_id').notNull(),
    scheduleId: text('schedule_id').notNull(),
    dueAt: text('due_at').notNull(),
    takenAt: text('taken_at').notNull(),
    quantity: real('quantity').notNull(),
    outcome: text('outcome', { enum: ['Taken'] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.scheduleId, table.dueAt] }),
    foreignKey({
      columns: [table.ownerId, table.scheduleId],
      foreignColumns: [dailySchedules.ownerId, dailySchedules.id],
    }),
    index('dose_records_owner_due').on(table.ownerId, table.dueAt),
    check('dose_records_outcome', sql`${table.outcome} = 'Taken'`),
  ],
)

export const skippedDoseRecords = sqliteTable(
  'skipped_dose_records',
  {
    ownerId: text('owner_id').notNull(),
    scheduleId: text('schedule_id').notNull(),
    dueAt: text('due_at').notNull(),
    recordedAt: text('recorded_at').notNull(),
    outcome: text('outcome', { enum: ['Skipped'] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.scheduleId, table.dueAt] }),
    foreignKey({
      columns: [table.ownerId, table.scheduleId],
      foreignColumns: [dailySchedules.ownerId, dailySchedules.id],
    }),
    index('skipped_dose_records_owner_due').on(table.ownerId, table.dueAt),
    check('skipped_dose_records_outcome', sql`${table.outcome} = 'Skipped'`),
  ],
)

export const doseCorrections = sqliteTable(
  'dose_corrections',
  {
    ownerId: text('owner_id').notNull(),
    scheduleId: text('schedule_id').notNull(),
    dueAt: text('due_at').notNull(),
    revision: integer('revision').notNull(),
    actionId: text('action_id').notNull(),
    expectedOutcome: text('expected_outcome', { enum: ['Taken', 'Skipped'] }).notNull(),
    outcome: text('outcome', { enum: ['Taken', 'Skipped'] }).notNull(),
    takenAt: text('taken_at'),
    quantity: real('quantity'),
    recordedAt: text('recorded_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.scheduleId, table.dueAt, table.revision] }),
    unique().on(table.ownerId, table.actionId),
    foreignKey({
      columns: [table.ownerId, table.scheduleId],
      foreignColumns: [dailySchedules.ownerId, dailySchedules.id],
    }),
    index('dose_corrections_owner_due').on(table.ownerId, table.dueAt),
    check('dose_corrections_outcome', sql`${table.outcome} IN ('Taken', 'Skipped')`),
    check(
      'dose_corrections_expected_outcome',
      sql`${table.expectedOutcome} IN ('Taken', 'Skipped')`,
    ),
    check(
      'dose_corrections_details',
      sql`(${table.outcome} = 'Taken' AND ${table.takenAt} IS NOT NULL AND ${table.quantity} IS NOT NULL AND ${table.quantity} > 0) OR (${table.outcome} = 'Skipped' AND ${table.takenAt} IS NULL AND ${table.quantity} IS NULL)`,
    ),
  ],
)
