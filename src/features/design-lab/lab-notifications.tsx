'use client'

import type { ReactNode } from 'react'
import {
  NotificationDeviceProvider,
  type NotificationDevice,
} from '@/features/device-registrations/notification-device'

/** A browser that can receive notifications and hasn't been asked: Settings shows Off. */
const notificationsOff: NotificationDevice = {
  support: () => 'browser',
  permission: () => 'default',
  requestPermission: async () => 'default',
  installation: () => Promise.reject(new Error('No lab installation')),
  registration: () => Promise.reject(new Error('No lab registration')),
}

/** Provides the lab's device in place of the browser's, so a frame reads nothing from it. */
export function LabNotificationsOff({ children }: { children: ReactNode }) {
  return (
    <NotificationDeviceProvider value={notificationsOff}>{children}</NotificationDeviceProvider>
  )
}
