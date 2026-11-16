'use client'

/**
 * Keeps this device's Device registration current outside Settings (#355). The browser
 * remembers the installation ID of a registration the server confirmed, so a launch loads
 * Firebase only on a device that turned notifications on. A signed-in launch renews it with the
 * current token while permission stays granted (renew never recreates a removed one), and
 * removes it once permission is revoked. Sign out removes it first and always continues,
 * leaving a failed removal for Turn off or the sender (#30). Session expiry touches nothing.
 * The installation ID identifies the registration but is no credential; the token is never kept.
 */
import { useEffect } from 'react'
import type { DeviceInstallation } from './contract'
import { useNotificationDevice, type NotificationDevice } from './notification-device'
import { removeDeviceRegistration, renewDeviceRegistration } from './queries'

const storageKey = 'meddies:device-registration'

/** The installation this browser last saw confirmed as registered. Storage may be unavailable. */
export const registeredInstallation = {
  get(): DeviceInstallation | undefined {
    try {
      const installationId = localStorage.getItem(storageKey)
      return installationId ? { installationId } : undefined
    } catch {
      return undefined
    }
  },
  set({ installationId }: DeviceInstallation) {
    try {
      localStorage.setItem(storageKey, installationId)
    } catch {}
  },
  /** Forgets `installation` only if it is the one remembered. */
  clear(installation?: DeviceInstallation) {
    try {
      const remembered = localStorage.getItem(storageKey)
      if (!installation || remembered === installation.installationId)
        localStorage.removeItem(storageKey)
    } catch {}
  },
}

/** Renews or removes the remembered registration for a signed-in launch. Never throws. */
export async function keepRegistrationCurrent(device: NotificationDevice) {
  const remembered = registeredInstallation.get()
  if (!remembered) return
  try {
    const support = device.support()
    if (support !== 'browser' && support !== 'iphone') return
    if (device.permission() === 'granted') {
      const registration = await device.registration()
      const result = await renewDeviceRegistration(registration)
      if (result.saved?.registered) registeredInstallation.set(registration)
      else if (result.saved) registeredInstallation.clear(remembered)
      return
    }
    const result = await removeDeviceRegistration(remembered)
    if (result.saved) registeredInstallation.clear(remembered)
  } catch {
    // No token or no Firebase: the next launch tries again.
  }
}

/** Removes this device's registration before Sign out. Never throws, so Sign out continues. */
export async function removeRegistrationForSignOut() {
  const remembered = registeredInstallation.get()
  if (!remembered) return
  const result = await removeDeviceRegistration(remembered)
  if (result.saved) registeredInstallation.clear(remembered)
}

let launched = false

/** Mounted inside every signed-in page; runs once per page load. */
export function RegistrationUpkeep() {
  const device = useNotificationDevice()
  useEffect(() => {
    if (launched) return
    launched = true
    void keepRegistrationCurrent(device)
  }, [device])
  return null
}
