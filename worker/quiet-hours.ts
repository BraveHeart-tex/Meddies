// Quiet hours persistence (#35). An account with no account_preferences row reads as off. A set
// is one receipt insert keyed by its action ID; the 0021 trigger applies its value in the same
// statement, so a retry inserts nothing, returns its original outcome and writes nothing - a late
// retry never undoes a newer choice. A reused action ID with another value is a conflict and writes
// nothing. Setting Quiet hours writes no reminder rows: the due-reminder operation rechecks the
// current preference at send time (worker/due-reminders.ts).
import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { QuietHours, QuietHoursChange } from '../src/features/quiet-hours/contract'
import { ApplicationError } from '../src/lib/application-error'
import { accountPreferences, quietHoursReceipts } from './schema'

export async function readQuietHours(db: DrizzleD1Database, ownerId: string): Promise<QuietHours> {
  const [row] = await db
    .select({ quietHours: accountPreferences.quietHours })
    .from(accountPreferences)
    .where(eq(accountPreferences.ownerId, ownerId))
  return { quietHours: row?.quietHours ?? false }
}

export async function setQuietHours(
  db: DrizzleD1Database,
  ownerId: string,
  { actionId, quietHours }: QuietHoursChange,
  now: Date,
): Promise<QuietHours> {
  await db
    .insert(quietHoursReceipts)
    .values({ ownerId, actionId, quietHours, savedAt: now.toISOString() })
    .onConflictDoNothing()
  const [receipt] = await db
    .select({ quietHours: quietHoursReceipts.quietHours })
    .from(quietHoursReceipts)
    .where(and(eq(quietHoursReceipts.ownerId, ownerId), eq(quietHoursReceipts.actionId, actionId)))
  if (receipt.quietHours !== quietHours) throw new ApplicationError('conflict', 409)
  return { quietHours }
}
