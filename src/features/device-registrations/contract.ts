// Runtime-neutral Device registration commands (#353). The Firebase installation ID
// identifies a registration; the FCM registration token is a credential that only the
// Worker stores. Every response is `{ registered }` and never carries a token.
// Formats are checked locally only: the sender (#30) learns token validity from FCM.
import { ApplicationError } from '../../lib/application-error'

// Firebase installation IDs are 22 base64url characters whose first four bits are 0111.
const installationId = /^[c-f][A-Za-z0-9_-]{21}$/
// FCM registration tokens are opaque base64url text with a colon after the installation ID.
const token = /^[A-Za-z0-9_:-]{32,1024}$/

export type DeviceInstallation = { installationId: string }
export type DeviceRegistration = DeviceInstallation & { token: string }
export type DeviceRegistrationStatus = { registered: boolean }

export type DeviceRegistrationCommand =
  | { operation: 'save' | 'renew'; ownerId: string; registration: DeviceRegistration }
  | { operation: 'remove' | 'read'; ownerId: string; installation: DeviceInstallation }

export function parseDeviceInstallation(value: unknown): DeviceInstallation {
  const input = value as Record<string, unknown> | null
  if (typeof input?.installationId !== 'string' || !installationId.test(input.installationId))
    throw new ApplicationError('validation', 400)
  return { installationId: input.installationId }
}

export function parseDeviceRegistration(value: unknown): DeviceRegistration {
  const installation = parseDeviceInstallation(value)
  const input = value as Record<string, unknown>
  if (typeof input.token !== 'string' || !token.test(input.token))
    throw new ApplicationError('validation', 400)
  return { ...installation, token: input.token }
}

export function parseDeviceRegistrationStatus(value: unknown): DeviceRegistrationStatus {
  const input = value as Record<string, unknown> | null
  if (typeof input?.registered !== 'boolean') throw new Error('device registration contract')
  return { registered: input.registered }
}
