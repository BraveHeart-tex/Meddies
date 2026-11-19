'use client'

/**
 * Names in reminders on Settings (#384 Direction D, built by #389): the account's Medication
 * names as the Notifications group's third row. It stays visible and changeable whatever this
 * device's notification case. "Can show" because the phone's preview settings decide what the
 * lock screen shows. Wording follows docs/copy.md and the #37 medication names rules.
 */
import { Eye, EyeOff, Tag } from 'lucide-react'
import { AccountSwitchRow, type AccountSwitchCopy } from '@/components/layout/account-switch-row'
import type { AccountSwitchState } from '@/lib/use-account-switch'

const copy: AccountSwitchCopy = {
  icon: Tag,
  title: 'Names in reminders',
  onIcon: Eye,
  offIcon: EyeOff,
  line: 'On, reminders name your medications, so they can show on your lock screen.',
  switchLabel: 'Medication names in reminders on all your devices',
  notOn: 'Medication names aren’t on.',
  notOff: 'Medication names aren’t off.',
}

export function MedicationNamesRow(props: {
  state: AccountSwitchState
  offline?: boolean
  onChange?: (medicationNames: boolean) => void
}) {
  return <AccountSwitchRow copy={copy} {...props} />
}
