import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core'

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
