// Medication names persistence (#37). An account with no account_preferences row reads as off. A
// set is one receipt insert keyed by its action ID; the 0022 trigger applies its value in the same
// statement, so a retry inserts nothing, returns its original outcome and writes nothing - a late
// retry never undoes a newer choice. A reused action ID with another value is a conflict and writes
// nothing. Medication names and Quiet hours share the row but read and set independently. Setting
// Medication names writes no reminder rows: the due-reminder operation rechecks the current
// preference at send time (worker/due-reminders.ts), as later senders will.
import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type {
  MedicationNames,
  MedicationNamesChange,
} from '../src/features/medication-names/contract'
import { ApplicationError } from '../src/lib/application-error'
import { accountPreferences, medicationNamesReceipts } from './schema'

export async function readMedicationNames(
  db: DrizzleD1Database,
  ownerId: string,
): Promise<MedicationNames> {
  const [row] = await db
    .select({ medicationNames: accountPreferences.medicationNames })
    .from(accountPreferences)
    .where(eq(accountPreferences.ownerId, ownerId))
  return { medicationNames: row?.medicationNames ?? false }
}

export async function setMedicationNames(
  db: DrizzleD1Database,
  ownerId: string,
  { actionId, medicationNames }: MedicationNamesChange,
  now: Date,
): Promise<MedicationNames> {
  await db
    .insert(medicationNamesReceipts)
    .values({ ownerId, actionId, medicationNames, savedAt: now.toISOString() })
    .onConflictDoNothing()
  const [receipt] = await db
    .select({ medicationNames: medicationNamesReceipts.medicationNames })
    .from(medicationNamesReceipts)
    .where(
      and(
        eq(medicationNamesReceipts.ownerId, ownerId),
        eq(medicationNamesReceipts.actionId, actionId),
      ),
    )
  if (receipt.medicationNames !== medicationNames) throw new ApplicationError('conflict', 409)
  return { medicationNames }
}
