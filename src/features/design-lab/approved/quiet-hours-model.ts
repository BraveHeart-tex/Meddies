/**
 * #380 approved Direction A: account-wide quiet hours on Settings. Values the frames share;
 * wording follows docs/copy.md and the #35 quiet hours rules.
 */

/** The quiet hours switch's moments: at rest, Turn on saving, and Turn on not known to save. */
export type QuietHoursState = 'off' | 'on' | 'turning-on' | 'unconfirmed'

/** This device's case beside it: Off, or a browser that can't receive notifications. */
export type DeviceCase = 'off' | 'unsupported'

export const quietWindow = '23:00-08:00'

export const quietStatus: Record<QuietHoursState, string> = {
  off: 'Off',
  on: 'On',
  'turning-on': 'Turning on...',
  unconfirmed: 'Off',
}

/** What quiet hours change, never promising delivery or bypassing phone Focus. */
export const quietEffect =
  'Dose reminders still go out on time. Follow-ups are skipped, not sent later.'

/** The group note: unlike this device's notifications, quiet hours reach every device. */
export const quietScope = 'Applies to all your devices.'
