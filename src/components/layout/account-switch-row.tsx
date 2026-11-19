'use client'

/**
 * A Switch row for one account-wide preference on Settings, such as Quiet hours (#381) and
 * Medication names (#389). The switch never moves ahead of the server: while Turn on saves it
 * stays off and disabled, and while Turn off saves it stays on and disabled. Offline disables it
 * and adds a line saying why; a save alert sits inside the row, under its lines. Wording follows
 * docs/copy.md.
 */
import type { LucideIcon } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { saveMessages } from '@/lib/save-messages'
import type { AccountSwitchState } from '@/lib/use-account-switch'
import {
  SaveAlert,
  SettingsSwitchRow,
  StatusPlaceholder,
  SwitchLine,
  SwitchStatus,
} from './settings-switch-row'

type Shown = Exclude<AccountSwitchState, 'loading'>

const status: Record<Shown, string> = {
  off: 'Off',
  'turning-on': 'Turning on...',
  unconfirmed: 'Off',
  rejected: 'Off',
  on: 'On',
  'turning-off': 'Turning off...',
  'off-unconfirmed': 'On',
  'off-rejected': 'On',
}

const isOn = (state: AccountSwitchState) =>
  state === 'on' ||
  state === 'turning-off' ||
  state === 'off-unconfirmed' ||
  state === 'off-rejected'

const tryAgain = 'Check your connection and try again.'

export type AccountSwitchCopy = {
  /** The icon tile. */
  icon: LucideIcon
  title: string
  /** The status word's icons. */
  onIcon: LucideIcon
  offIcon: LucideIcon
  /** What changes when it is on. */
  line: string
  switchLabel: string
  /** A rejected Turn on's and Turn off's alert titles. */
  notOn: string
  notOff: string
}

/** Renders one state; `onChange` runs from the switch's tap with the value it asks for. */
export function AccountSwitchRow({
  copy,
  state,
  offline = false,
  onChange,
}: {
  copy: AccountSwitchCopy
  state: AccountSwitchState
  offline?: boolean
  onChange?: (on: boolean) => void
}) {
  const shown = state === 'loading' ? undefined : state
  const on = isOn(state)
  const alert = (() => {
    if (state === 'unconfirmed' || state === 'off-unconfirmed')
      return { title: saveMessages.mightNotHaveSaved, body: saveMessages.retrySameSave }
    if (state === 'rejected') return { title: copy.notOn, body: tryAgain }
    if (state === 'off-rejected') return { title: copy.notOff, body: tryAgain }
  })()
  return (
    <SettingsSwitchRow
      icon={copy.icon}
      title={copy.title}
      status={
        shown ? (
          <SwitchStatus icon={on ? copy.onIcon : copy.offIcon} on={on}>
            {status[shown]}
          </SwitchStatus>
        ) : (
          <StatusPlaceholder />
        )
      }
      control={
        shown && (
          <Switch
            checked={on}
            disabled={state === 'turning-on' || state === 'turning-off' || offline || !onChange}
            onCheckedChange={(checked) => checked !== on && onChange?.(checked)}
            aria-label={copy.switchLabel}
          />
        )
      }
    >
      <SwitchLine>{copy.line}</SwitchLine>
      {shown && offline && (
        <SwitchLine>{on ? 'Connect to turn off.' : 'Connect to turn on.'}</SwitchLine>
      )}
      {alert && <SaveAlert {...alert} />}
    </SettingsSwitchRow>
  )
}
