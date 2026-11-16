// Device registration persistence (#353). Each statement is a single atomic write keyed by
// the installation ID: save upserts and moves the row to the caller, renew updates only the
// caller's existing row and never recreates a removed one, and remove is idempotent.
// Results report only whether the caller's installation is registered, never the token.
import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type {
  DeviceInstallation,
  DeviceRegistration,
  DeviceRegistrationStatus,
} from '../src/features/device-registrations/contract'
import { deviceRegistrations } from './schema'

const owned = (ownerId: string, installationId: string) =>
  and(
    eq(deviceRegistrations.installationId, installationId),
    eq(deviceRegistrations.ownerId, ownerId),
  )

export async function saveDeviceRegistration(
  db: DrizzleD1Database,
  ownerId: string,
  registration: DeviceRegistration,
  now: Date,
): Promise<DeviceRegistrationStatus> {
  const updatedAt = now.toISOString()
  await db
    .insert(deviceRegistrations)
    .values({ ...registration, ownerId, updatedAt })
    .onConflictDoUpdate({
      target: deviceRegistrations.installationId,
      set: { ownerId, token: registration.token, updatedAt },
    })
  return { registered: true }
}

export async function renewDeviceRegistration(
  db: DrizzleD1Database,
  ownerId: string,
  registration: DeviceRegistration,
  now: Date,
): Promise<DeviceRegistrationStatus> {
  const rows = await db
    .update(deviceRegistrations)
    .set({ token: registration.token, updatedAt: now.toISOString() })
    .where(owned(ownerId, registration.installationId))
    .returning({ installationId: deviceRegistrations.installationId })
  return { registered: rows.length > 0 }
}

export async function removeDeviceRegistration(
  db: DrizzleD1Database,
  ownerId: string,
  installation: DeviceInstallation,
): Promise<DeviceRegistrationStatus> {
  await db.delete(deviceRegistrations).where(owned(ownerId, installation.installationId))
  return { registered: false }
}

export async function readDeviceRegistration(
  db: DrizzleD1Database,
  ownerId: string,
  installation: DeviceInstallation,
): Promise<DeviceRegistrationStatus> {
  const rows = await db
    .select({ installationId: deviceRegistrations.installationId })
    .from(deviceRegistrations)
    .where(owned(ownerId, installation.installationId))
  return { registered: rows.length > 0 }
}
