/**
 * #384 approved Direction D: this device's notifications, Quiet hours and Medication names as rows
 * of one Notifications group on Settings. Values the frames share; wording follows docs/copy.md
 * and the #35 and #37 rules.
 */

/** The medication names switch's moments: at rest, Turn on saving, and Turn on not known to save. */
export type MedicationNamesState = 'off' | 'on' | 'turning-on' | 'unconfirmed'

/** This device's case beside it: Off, or a browser that can't receive notifications. */
export type DeviceCase = 'off' | 'unsupported'

/** Quiet hours' window joins its title, since the group heading no longer names it. */
export const quietTitle = 'Quiet hours · 23:00-08:00'
export const quietEffect =
  'Dose reminders still go out on time. Follow-ups are skipped, not sent later.'

export const namesTitle = 'Names in reminders'

export const namesStatus: Record<MedicationNamesState, string> = {
  off: 'Off',
  on: 'On',
  'turning-on': 'Turning on...',
  unconfirmed: 'Off',
}

/**
 * What turning it on changes: names can reach the lock screen. "Can" because the phone's preview
 * settings decide what shows, and Meddies never promises how the phone displays them.
 */
export const namesEffect =
  'On, reminders name your medications, so they can show on your lock screen.'

export const namesSwitchLabel = 'Medication names in reminders on all your devices'

/** The group note: unlike this device's row, these two reach every device. */
export const accountScope = 'Quiet hours and medication names apply to all your devices.'
