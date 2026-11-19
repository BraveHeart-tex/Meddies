'use client'

/**
 * The account's Quiet hours on Settings (#380 Direction A, built by #381; merged into the
 * Notifications group by #389): one row titled by the fixed window, with the status word and its
 * icon, one short line on what changes and a switch that is always there once the saved value
 * loads. Wording follows docs/copy.md and the #35 quiet hours rules.
 */
import { Moon, MoonStar } from 'lucide-react'
import { AccountSwitchRow, type AccountSwitchCopy } from '@/components/layout/account-switch-row'
import type { AccountSwitchState } from '@/lib/use-account-switch'

const copy: AccountSwitchCopy = {
  icon: Moon,
  // The fixed window, 23:00 inclusive to 08:00 exclusive, Europe/Istanbul.
  title: 'Quiet hours · 23:00-08:00',
  onIcon: MoonStar,
  offIcon: Moon,
  line: 'Dose reminders still go out on time. Follow-ups are skipped, not sent later.',
  switchLabel: 'Quiet hours on all your devices',
  notOn: 'Quiet hours aren’t on.',
  notOff: 'Quiet hours aren’t off.',
}

export function QuietHoursRow(props: {
  state: AccountSwitchState
  offline?: boolean
  onChange?: (quietHours: boolean) => void
}) {
  return <AccountSwitchRow copy={copy} {...props} />
}
