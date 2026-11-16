/**
 * #351 approved Direction D: copy for this device's notification row on Settings. Wording follows
 * docs/copy.md and the #29 device registration rules (docs/product/reminders.md): Settings never
 * promises delivery or that a dose was taken, and Meddies cannot ask for permission twice.
 */
import { saveMessages } from '@/lib/save-messages'

/**
 * The device cases plus the Turn on save's in-flight and might-not-have-saved moments. iPhone
 * needs the Home Screen app; Android Chrome gets notifications in the browser, so only Blocked
 * differs by platform there.
 */
export type NotificationState =
  | 'unsupported'
  | 'home-screen'
  | 'off'
  | 'turning-on'
  | 'unconfirmed'
  | 'blocked-iphone'
  | 'blocked-android'
  | 'on'

/** The status line under "This device", always paired with its icon. */
export const statusLabel: Record<NotificationState, string> = {
  unsupported: 'Not available in this browser',
  'home-screen': 'Needs Home Screen app',
  off: 'Off',
  'turning-on': 'Turning on...',
  unconfirmed: 'Off',
  'blocked-iphone': 'Blocked',
  'blocked-android': 'Blocked',
  on: 'On',
}

/**
 * One short line under the status, only where the rules need words the status can't carry:
 * Off says permission is asked first, Blocked that Meddies can't ask again.
 */
export const statusBody: Partial<Record<NotificationState, string>> = {
  off: 'Asks permission first.',
  'turning-on': 'Asks permission first.',
  unconfirmed: 'Asks permission first.',
  'blocked-iphone': 'Meddies can’t ask again.',
  'blocked-android': 'Meddies can’t ask again.',
}

export const steps: Partial<Record<NotificationState, readonly string[]>> = {
  'home-screen': [
    'In Safari, tap Share.',
    'Tap Add to Home Screen.',
    'Open Meddies from your Home Screen.',
  ],
  'blocked-iphone': [
    'Open iPhone Settings.',
    'Tap Notifications, then Meddies.',
    'Turn on Allow Notifications.',
  ],
  'blocked-android': [
    'In Chrome, tap the icon left of the address.',
    'Tap Permissions.',
    'Turn on Notifications.',
  ],
}

/** The shared might-not-have-saved feedback under the card; tapping the switch retries. */
export const unconfirmedAlert = {
  title: saveMessages.mightNotHaveSaved,
  body: saveMessages.retrySameSave,
} as const

/** Lab-only captions naming each variant on a state sheet; never product copy. */
export const variantCaption: Record<NotificationState, string> = {
  unsupported: 'Can’t receive',
  'home-screen': 'iPhone in Safari',
  off: 'Off',
  'turning-on': 'Off · Turning on',
  unconfirmed: 'Off · Might not have saved',
  'blocked-iphone': 'Blocked · iPhone',
  'blocked-android': 'Blocked · Android Chrome',
  on: 'On',
}
