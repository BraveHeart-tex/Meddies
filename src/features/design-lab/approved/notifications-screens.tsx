'use client'

/**
 * #351 approved Direction D: one Settings row with an on/off switch for this device. The row
 * reads top-down: This device, its status (icon and word), then at most one short line; the
 * switch sits at the end only when Meddies can change the state. Steps follow as numbered rows in
 * the same card, and the save alert sits right under it. The switch never moves ahead of the
 * server: while Turn on saves it stays off and disabled.
 */
import { Switch } from '@base-ui/react/switch'
import {
  Ban,
  Bell,
  BellOff,
  BellRing,
  CircleSlash,
  Clock,
  Hourglass,
  ShieldCheck,
  SquarePlus,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { SettingsGroup, SettingsRow } from '@/app/settings/settings-list'
import { AppHeader } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { AuthControl } from '@/features/auth/controls'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { cn } from '@/lib/utils'
import { FixtureQuery } from '../fixture-query'
import { NOW, SESSION_EXPIRES } from '../lab-fixtures'
import {
  statusBody,
  statusLabel,
  steps,
  unconfirmedAlert,
  variantCaption,
  type NotificationState,
} from './notifications-model'

const statusIcon: Record<NotificationState, LucideIcon> = {
  unsupported: CircleSlash,
  'home-screen': SquarePlus,
  off: BellOff,
  'turning-on': BellOff,
  unconfirmed: BellOff,
  'blocked-iphone': Ban,
  'blocked-android': Ban,
  on: BellRing,
}

const switchable = (state: NotificationState) =>
  state === 'off' || state === 'turning-on' || state === 'unconfirmed' || state === 'on'

/** Lab-only switch; the build adds it to `src/components/ui` as the shadcn Switch. */
function NotificationSwitch({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <Switch.Root
      checked={checked}
      disabled={disabled}
      aria-label="Notifications on this device"
      className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-input p-0.5 transition-colors duration-140 ease-calm outline-none after:absolute after:-inset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-45 data-checked:bg-primary motion-reduce:transition-none"
    >
      <Switch.Thumb className="size-6 rounded-full bg-card shadow-nav transition-transform duration-140 ease-calm data-checked:translate-x-5 motion-reduce:transition-none" />
    </Switch.Root>
  )
}

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

export function NotificationsGroup({ state }: { state: NotificationState }) {
  const Icon = statusIcon[state]
  const body = statusBody[state]
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
                  {/* Icon and word together, so the status never rests on color. */}
                  <span
                    className={cn(
                      'flex items-center gap-1 text-body-sm font-bold text-muted-foreground [&>svg]:size-4',
                      state === 'on' && 'text-dose-taken-foreground',
                    )}
                  >
                    <Icon aria-hidden="true" />
                    {statusLabel[state]}
                  </span>
                </div>
                {switchable(state) && (
                  <NotificationSwitch checked={state === 'on'} disabled={state === 'turning-on'} />
                )}
              </div>
              {body && <p className="text-caption text-muted-foreground">{body}</p>}
            </ItemContent>
          </Item>
          {steps[state]?.map((step, index) => (
            <StepRow key={step} number={index + 1}>
              {step}
            </StepRow>
          ))}
        </ItemGroup>
      </Card>
      {state === 'unconfirmed' && (
        <Alert variant="destructive" className="mt-1">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{unconfirmedAlert.title}</AlertTitle>
          <AlertDescription>{unconfirmedAlert.body}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}

/** Settings as it ships (238·A5) with the Notifications group first, above Account. */
export function SettingsWithNotifications({ state }: { state: NotificationState }) {
  return (
    <FixtureQuery now={NOW}>
      <AppShell current="/settings">
        <section className="space-y-5">
          <AppHeader title="Settings" />
          <NotificationsGroup state={state} />
          <SettingsGroup title="Account">
            <SettingsRow icon={UserRound} label="Google account">
              <span className="flex items-center gap-1 text-dose-taken-foreground [&>svg]:size-4">
                <ShieldCheck aria-hidden="true" />
                Approved
              </span>
            </SettingsRow>
            <SettingsRow icon={Hourglass} label="Session ends">
              <time dateTime={SESSION_EXPIRES}>
                {formatShortDay(SESSION_EXPIRES, NOW)} at {formatTime(SESSION_EXPIRES)}
              </time>
            </SettingsRow>
          </SettingsGroup>
          <SettingsGroup title="Time" note="Uses Istanbul time on every device.">
            <SettingsRow icon={Clock} label="Times">
              Istanbul, 24-hour
            </SettingsRow>
          </SettingsGroup>
          <div className="space-y-1">
            <AuthControl signedIn />
            <p className="text-caption text-muted-foreground">
              Signs out this browser only. Google and other devices stay signed in.
            </p>
          </div>
        </section>
      </AppShell>
    </FixtureQuery>
  )
}

/**
 * Lab-only: the Notifications group in several states, each under a dashed caption naming the
 * state, so all states fit in four frames. Settings renders one state at a time.
 */
export function StateSheet({ states }: { states: readonly NotificationState[] }) {
  return (
    <main className="mx-auto min-h-svh max-w-2xl space-y-6 bg-background px-5 py-5">
      {states.map((state) => (
        <div key={state} className="space-y-2.5">
          <Badge variant="pending">{variantCaption[state]}</Badge>
          <NotificationsGroup state={state} />
        </div>
      ))}
    </main>
  )
}
