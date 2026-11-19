'use client'

/**
 * This device's notifications on Settings (#351 Direction D, built by #354; first row of the
 * Notifications group since #389): one row with the status (icon and word, so it never rests on
 * color), at most one short line, a switch at the end only when Meddies can change the state, and
 * a save alert inside the row. Steps follow right under it as numbered rows in the same card.
 * The switch never moves ahead of the server: while Turn on saves it stays off and disabled, and
 * while Turn off (#355) saves it stays on and disabled. Wording follows docs/copy.md and the #29
 * device registration rules.
 */
import {
  Ban,
  Bell,
  BellOff,
  BellRing,
  CircleSlash,
  SquarePlus,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import {
  SaveAlert,
  SettingsSwitchRow,
  StatusPlaceholder,
  SwitchLine,
  SwitchStatus,
} from '@/components/layout/settings-switch-row'
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { saveMessages } from '@/lib/save-messages'

/**
 * The device cases plus the Turn on and Turn off saves' moments. `checking` is the row before this device's
 * case is known. iPhone needs the Home Screen app; Android Chrome and desktop browsers get
 * notifications in the browser, so only Blocked differs by platform.
 */
export type NotificationState =
  | 'checking'
  | 'unsupported'
  | 'home-screen'
  | 'off'
  | 'turning-on'
  | 'unconfirmed'
  | 'rejected'
  | 'blocked-iphone'
  | 'blocked-android'
  | 'on'
  | 'turning-off'
  | 'off-unconfirmed'
  | 'off-rejected'

type Shown = Exclude<NotificationState, 'checking'>

const status: Record<Shown, { label: string; icon: LucideIcon }> = {
  unsupported: { label: 'Not available in this browser', icon: CircleSlash },
  'home-screen': { label: 'Needs Home Screen app', icon: SquarePlus },
  off: { label: 'Off', icon: BellOff },
  'turning-on': { label: 'Turning on...', icon: BellOff },
  unconfirmed: { label: 'Off', icon: BellOff },
  rejected: { label: 'Off', icon: BellOff },
  'blocked-iphone': { label: 'Blocked', icon: Ban },
  'blocked-android': { label: 'Blocked', icon: Ban },
  on: { label: 'On', icon: BellRing },
  'turning-off': { label: 'Turning off...', icon: BellRing },
  'off-unconfirmed': { label: 'On', icon: BellRing },
  'off-rejected': { label: 'On', icon: BellRing },
}

const asksFirst = 'Asks permission first.'
const cantAskAgain = 'Meddies can’t ask again.'
const body: Partial<Record<Shown, string>> = {
  off: asksFirst,
  'turning-on': asksFirst,
  unconfirmed: asksFirst,
  rejected: asksFirst,
  'blocked-iphone': cantAskAgain,
  'blocked-android': cantAskAgain,
}

const steps: Partial<Record<Shown, readonly string[]>> = {
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

const alerts: Partial<Record<Shown, { title: string; body: string }>> = {
  unconfirmed: { title: saveMessages.mightNotHaveSaved, body: saveMessages.retrySameSave },
  rejected: { title: 'Notifications aren’t on.', body: 'Check your connection and try again.' },
  'off-unconfirmed': { title: saveMessages.mightNotHaveSaved, body: saveMessages.retrySameSave },
  'off-rejected': {
    title: 'Notifications aren’t off.',
    body: 'Check your connection and try again.',
  },
}

const turnsOn = (state: NotificationState) =>
  state === 'off' || state === 'turning-on' || state === 'unconfirmed' || state === 'rejected'
const turnsOff = (state: NotificationState) =>
  state === 'on' ||
  state === 'turning-off' ||
  state === 'off-unconfirmed' ||
  state === 'off-rejected'
const isOn = (state: NotificationState) => state === 'on' || turnsOff(state)

/** A numbered step as an inset-list row, the number in the icon tile's place. */
function StepRow({ number, children }: { number: number; children: ReactNode }) {
  return (
    <Item
      role="listitem"
      className="gap-3 rounded-none border-0 px-3.5 py-2.5 before:absolute before:top-0 before:right-0 before:left-15.5 before:h-px before:bg-border"
    >
      <ItemMedia className="size-9 rounded-sm bg-muted text-body-sm font-extrabold text-muted-foreground tabular-nums">
        {number}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="text-body-sm font-bold">{children}</ItemTitle>
      </ItemContent>
    </Item>
  )
}

/**
 * Renders one state as the row and its steps. `offline` disables the switch and says why;
 * `onTurnOn` runs from the switch's tap, so a permission prompt it opens comes from that tap, and
 * `onTurnOff` from the tap on On's switch. While this device's case is unknown, placeholders hold
 * the status word and Off's line: the device check after the Settings fallback is brief.
 */
export function DeviceNotificationsRow({
  state,
  offline = false,
  onTurnOn,
  onTurnOff,
}: {
  state: NotificationState
  offline?: boolean
  onTurnOn?: () => void
  onTurnOff?: () => void
}) {
  const shown = state === 'checking' ? undefined : state
  const line =
    shown && offline && turnsOn(shown)
      ? 'Connect to turn on.'
      : shown && offline && turnsOff(shown)
        ? 'Connect to turn off.'
        : shown && body[shown]
  const toggle = turnsOn(state) ? onTurnOn : onTurnOff
  const alert = shown && alerts[shown]
  return (
    <>
      <SettingsSwitchRow
        icon={Bell}
        title="This device"
        status={
          shown ? (
            <SwitchStatus icon={status[shown].icon} on={isOn(shown)}>
              {status[shown].label}
            </SwitchStatus>
          ) : (
            <StatusPlaceholder />
          )
        }
        control={
          (turnsOn(state) || turnsOff(state)) && (
            <Switch
              checked={isOn(state)}
              disabled={state === 'turning-on' || state === 'turning-off' || offline || !toggle}
              onCheckedChange={(checked) => checked !== isOn(state) && toggle?.()}
              aria-label="Notifications on this device"
            />
          )
        }
      >
        {line && <SwitchLine>{line}</SwitchLine>}
        {/* Holds Off's line, the case most devices resolve to. */}
        {state === 'checking' && (
          <div className="flex h-lh items-center text-caption">
            <Skeleton className="h-2.5 w-28 rounded-md" />
          </div>
        )}
        {alert && <SaveAlert {...alert} />}
      </SettingsSwitchRow>
      {shown &&
        steps[shown]?.map((step, index) => (
          <StepRow key={step} number={index + 1}>
            {step}
          </StepRow>
        ))}
    </>
  )
}
