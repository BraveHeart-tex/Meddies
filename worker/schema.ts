import { sqliteTable, text, primaryKey, unique, foreignKey } from 'drizzle-orm/sqlite-core'

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
