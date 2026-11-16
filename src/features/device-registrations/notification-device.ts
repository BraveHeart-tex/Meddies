'use client'

/**
 * This browser's side of a Device registration (#354): which notification case applies, its
 * permission, and its Firebase installation ID and FCM token. Settings reads it through
 * `useNotificationDevice()`; tests and the design lab provide a controlled device instead.
 * Firebase loads on first use, never with the page. Without the Firebase env values the
 * browser can't receive notifications.
 */
import { createContext, useContext } from 'react'
import type { DeviceInstallation, DeviceRegistration } from './contract'

/** `iphone` is the Home Screen app; `browser` is any other browser that can receive pushes. */
export type NotificationSupport = 'unsupported' | 'home-screen' | 'iphone' | 'browser'

export type NotificationDevice = {
  support: () => NotificationSupport
  permission: () => NotificationPermission
  /** Call synchronously from the tap: browsers only prompt from a user gesture. */
  requestPermission: () => Promise<NotificationPermission>
  installation: () => Promise<DeviceInstallation>
  /** Registers the service worker and subscribes. Needs permission granted. */
  registration: () => Promise<DeviceRegistration>
}

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}
const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
const configured = Boolean(
  config.apiKey && config.projectId && config.messagingSenderId && config.appId && vapidKey,
)

async function firebaseApp() {
  const { getApps, initializeApp } = await import('firebase/app')
  return getApps()[0] ?? initializeApp(config)
}

async function installation(): Promise<DeviceInstallation> {
  const { getId, getInstallations } = await import('firebase/installations')
  return { installationId: await getId(getInstallations(await firebaseApp())) }
}

const iPhone = () => /iPhone/.test(navigator.userAgent)
// Other iPhone browsers report their own name; the Home Screen steps are Safari's.
const iPhoneSafari = () => iPhone() && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent)
const standalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
const canReceive = () =>
  configured &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'indexedDB' in window

export const browserNotificationDevice: NotificationDevice = {
  support() {
    if (iPhone() && !standalone()) return iPhoneSafari() ? 'home-screen' : 'unsupported'
    if (!canReceive()) return 'unsupported'
    return iPhone() ? 'iphone' : 'browser'
  },
  permission: () => Notification.permission,
  requestPermission: () => Notification.requestPermission(),
  installation,
  async registration() {
    // The service worker only displays incoming messages (public/sw.js).
    const worker = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const { getMessaging, getToken } = await import('firebase/messaging')
    const token = await getToken(getMessaging(await firebaseApp()), {
      vapidKey,
      serviceWorkerRegistration: worker,
    })
    return { ...(await installation()), token }
  },
}

const NotificationDeviceContext = createContext<NotificationDevice>(browserNotificationDevice)
export const NotificationDeviceProvider = NotificationDeviceContext.Provider
export const useNotificationDevice = () => useContext(NotificationDeviceContext)
