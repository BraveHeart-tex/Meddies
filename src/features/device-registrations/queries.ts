import { PrivateReadError } from '@/lib/session-check'
import { requestSave, type SaveResult } from '@/lib/session-saves'
import {
  parseDeviceRegistrationStatus,
  type DeviceInstallation,
  type DeviceRegistration,
  type DeviceRegistrationStatus,
} from './contract'

export const deviceRegistrationKeys = {
  /** Whether this device's installation is registered to the signed-in account. */
  status: () => ['device-registration', 'status'] as const,
  /** The Turn on saves, kept by the session's mutation cache across navigation. */
  turnOn: () => ['device-registration', 'turn-on'] as const,
}

/** Browser read of this installation's registration through the authenticated API route. */
export async function fetchDeviceRegistration(
  { installationId }: DeviceInstallation,
  signal?: AbortSignal,
): Promise<DeviceRegistrationStatus> {
  const timeout = AbortSignal.timeout(12000)
  const response = await fetch(
    `/api/device-registration?${new URLSearchParams({ installationId })}`,
    { cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout },
  )
  if (!response.ok) throw new PrivateReadError(response.status)
  return parseDeviceRegistrationStatus(await response.json())
}

/** Saves this installation's registration. The installation ID makes a retry idempotent. */
export function saveDeviceRegistration(
  registration: DeviceRegistration,
): Promise<SaveResult<DeviceRegistrationStatus>> {
  return requestSave('/api/device-registration', registration, parseDeviceRegistrationStatus, 'PUT')
}
