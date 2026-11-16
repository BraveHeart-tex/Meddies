'use client'

/**
 * This device's notifications on Settings (#351 Direction D, built by #354): one row with the
 * status (icon and word, so it never rests on color), at most one short line, and a switch at the
 * end only when Meddies can change the state. Steps follow as numbered rows in the same card and
 * a save alert sits right under it. The switch never moves ahead of the server: while Turn on
 * saves it stays off and disabled. On has no switch until Turn off (#355).
 * Wording follows docs/copy.md and the #29 device registration rules.
 */
import {
  Ban,
  Bell,
  BellOff,
  BellRing,
  CircleSlash,
  SquarePlus,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { saveMessages } from '@/lib/save-messages'
import { cn } from '@/lib/utils'

/**
 * The device cases plus the Turn on save's moments. `checking` is the row before this device's
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
}

const switchable = (state: NotificationState) =>
  state === 'off' || state === 'turning-on' || state === 'unconfirmed' || state === 'rejected'

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
 * The status word with its icon. While this device's case is unknown, a placeholder holds its
 * line unannounced: the Settings fallback's one status covers the route, and the device check
 * after it is brief.
 */
function Status({ state }: { state: NotificationState }) {
  if (state === 'checking')
    return (
      <div className="flex h-lh items-center text-body-sm">
        <Skeleton className="h-3 w-7 rounded-md" />
      </div>
    )
  const { label, icon: Icon } = status[state]
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-body-sm font-bold text-muted-foreground [&>svg]:size-4',
        state === 'on' && 'text-dose-taken-foreground',
      )}
    >
      <Icon aria-hidden="true" />
      {label}
    </span>
  )
}

/**
 * Renders one state. `offline` disables the switch and says why; `onTurnOn` runs from the
 * switch's tap, so a permission prompt it opens comes from that tap.
 */
export function NotificationsGroup({
  state,
  offline = false,
  onTurnOn,
}: {
  state: NotificationState
  offline?: boolean
  onTurnOn?: () => void
}) {
  const shown = state === 'checking' ? undefined : state
  const line = shown && switchable(shown) && offline ? 'Connect to turn on.' : shown && body[shown]
  const alert = shown && alerts[shown]
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-label leading-none tracking-eyebrow text-muted-foreground uppercase">
        Notifications
      </h2>
      <Card className="gap-0 py-0">
        <ItemGroup className="gap-0">
          <Item role="listitem" className="gap-3 rounded-none border-0 px-3.5 py-3">
            <ItemMedia className="size-9 self-start rounded-sm bg-secondary text-secondary-foreground [&>svg]:size-4.5">
              <Bell aria-hidden="true" />
            </ItemMedia>
            <ItemContent className="min-w-0 gap-1">
              <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex min-w-0 flex-col">
                  <ItemTitle>This device</ItemTitle>
                  <Status state={state} />
                </div>
                {switchable(state) && (
                  <Switch
                    checked={false}
                    disabled={state === 'turning-on' || offline || !onTurnOn}
                    onCheckedChange={(checked) => checked && onTurnOn?.()}
                    aria-label="Notifications on this device"
                  />
                )}
              </div>
              {line && <p className="text-caption text-muted-foreground">{line}</p>}
              {/* Holds Off's line, the case most devices resolve to. */}
              {state === 'checking' && (
                <div className="flex h-lh items-center text-caption">
                  <Skeleton className="h-2.5 w-28 rounded-md" />
                </div>
              )}
            </ItemContent>
          </Item>
          {shown &&
            steps[shown]?.map((step, index) => (
              <StepRow key={step} number={index + 1}>
                {step}
              </StepRow>
            ))}
        </ItemGroup>
      </Card>
      {alert && (
        <Alert variant="destructive" className="mt-1">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{alert.title}</AlertTitle>
          <AlertDescription>{alert.body}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}
