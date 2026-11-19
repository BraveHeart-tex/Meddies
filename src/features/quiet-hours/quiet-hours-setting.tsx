'use client'

/**
 * Settings' Quiet hours row (#381): the account's saved value and its Turn on and Turn off saves,
 * under the account-wide switch rules in use-account-switch.
 */
import { useAccountSwitch } from '@/lib/use-account-switch'
import { fetchQuietHours, quietHoursKeys, saveQuietHours } from './queries'
import { QuietHoursRow } from './quiet-hours-row'

export function QuietHoursSetting() {
  const { state, offline, change } = useAccountSwitch({
    field: 'quietHours',
    statusKey: quietHoursKeys.status(),
    changesKey: quietHoursKeys.changes(),
    read: fetchQuietHours,
    save: saveQuietHours,
  })
  return <QuietHoursRow state={state} offline={offline} onChange={change} />
}
