import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const stock = sqliteTable('stock', {
  run: text('run').primaryKey(), quantity: integer('quantity').notNull(),
});
export const records = sqliteTable('dose_record', {
  action: text('action').primaryKey(), run: text('run').notNull().references(() => stock.run),
  quantity: integer('quantity').notNull(),
});
export const movements = sqliteTable('stock_movement', {
  action: text('action').primaryKey().references(() => records.action),
  run: text('run').notNull().references(() => stock.run), quantity: integer('quantity').notNull(),
});
export const reminders = sqliteTable('reminder', {
  run: text('run').primaryKey().references(() => stock.run), token: text('token'),
  leaseUntil: integer('lease_until').notNull().default(0),
  completed: integer('completed').notNull().default(0),
});
