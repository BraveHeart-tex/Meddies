// Device registration persistence (#353). Each statement is a single atomic write keyed by
// the installation ID: save moves another account's row only with its current token;
// the owner can replace its token. Renew updates only the caller's existing row and never
// recreates a removed one, and remove is idempotent.
// Results report only whether the caller's installation is registered, never the token.
import { and, eq, or } from 'drizzle-orm'
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
  const rows = await db
    .insert(deviceRegistrations)
    .values({ ...registration, ownerId, updatedAt })
    .onConflictDoUpdate({
      target: deviceRegistrations.installationId,
      set: { ownerId, token: registration.token, updatedAt },
      setWhere: or(
        eq(deviceRegistrations.ownerId, ownerId),
        eq(deviceRegistrations.token, registration.token),
      ),
    })
    .returning({ installationId: deviceRegistrations.installationId })
  return { registered: rows.length > 0 }
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
