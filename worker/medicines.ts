import { and, asc, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { Medicine, MedicineResponses } from '../src/features/medicines/contract'
import { ApplicationError } from '../src/lib/application-error'
import { userMedications } from './schema'

const medicineColumns = {
  id: userMedications.id,
  label: userMedications.label,
  strength: userMedications.strength,
  unit: userMedications.unit,
}

export async function listMedicines(
  db: DrizzleD1Database,
  ownerId: string,
): Promise<MedicineResponses['list']> {
  const medicines = await db
    .select(medicineColumns)
    .from(userMedications)
    .where(eq(userMedications.ownerId, ownerId))
    .orderBy(asc(userMedications.label), asc(userMedications.id))
  return { medicines }
}

export async function saveMedicine(
  db: DrizzleD1Database,
  ownerId: string,
  medicine: Medicine,
): Promise<MedicineResponses['save']> {
  await db
    .insert(userMedications)
    .values({ ...medicine, ownerId })
    .onConflictDoNothing({ target: [userMedications.ownerId, userMedications.id] })
  const saved = await db
    .select(medicineColumns)
    .from(userMedications)
    .where(and(eq(userMedications.ownerId, ownerId), eq(userMedications.id, medicine.id)))
    .get()
  if (
    !saved ||
    saved.label !== medicine.label ||
    saved.strength !== medicine.strength ||
    saved.unit !== medicine.unit
  )
    throw new ApplicationError('conflict', 409)
  return { medicines: [saved] }
}
