'use client'

/**
 * Settings' Names in reminders row (#389): the account's saved Medication names and its Turn on
 * and Turn off saves, under the account-wide switch rules in use-account-switch.
 */
import { useAccountSwitch } from '@/lib/use-account-switch'
import { MedicationNamesRow } from './medication-names-row'
import { fetchMedicationNames, medicationNamesKeys, saveMedicationNames } from './queries'

export function MedicationNamesSetting() {
  const { state, offline, change } = useAccountSwitch({
    field: 'medicationNames',
    statusKey: medicationNamesKeys.status(),
    changesKey: medicationNamesKeys.changes(),
    read: fetchMedicationNames,
    save: saveMedicationNames,
  })
  return <MedicationNamesRow state={state} offline={offline} onChange={change} />
}
