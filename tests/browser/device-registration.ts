import { createHash } from 'node:crypto'
import {
  parseDeviceRegistration,
  type DeviceRegistration,
} from '../../src/features/device-registrations/contract'
import type { App } from './fixtures'

/**
 * A synthetic Device registration the contract parser accepts. Each `name` gives a distinct,
 * stable installation. No Firebase SDK or real token is involved.
 */
export function syntheticDeviceRegistration(name = 'browser-journey'): DeviceRegistration {
  const digest = createHash('sha256').update(name).digest('base64url')
  return parseDeviceRegistration({
    installationId: `c${digest.slice(0, 21)}`,
    token: `synthetic-${digest}`,
  })
}

/** Register `registration` for the signed-in user, as the notifications setting does. */
export async function registerDevice(
  app: Pick<App, 'api'>,
  registration = syntheticDeviceRegistration(),
): Promise<DeviceRegistration> {
  await app.api('PUT', '/api/device-registration', parseDeviceRegistration(registration))
  return registration
}
