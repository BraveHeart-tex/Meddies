import {
  sqliteTable,
  text,
  primaryKey,
  unique,
  foreignKey,
  real,
  index,
  check,
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
