'use client'

/**
 * #380 approved Direction A: account-wide quiet hours as their own Settings group right under
 * this device's notifications (#351 D). The row is titled by the fixed window, with the status
 * word and its icon under it, one short line and a switch at the end. The switch never moves
 * ahead of the server, the save alert sits right under the card, and the row stays changeable
 * whatever this device's case. Settings group headings are sentence case, and Sign out carries
 * its icon.
 */
import {
  Clock,
  Hourglass,
  LogOut,
  Moon,
  MoonStar,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from 'lucide-react'
import { SettingsGroup, SettingsRow } from '@/app/settings/settings-list'
import { AppHeader } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Switch } from '@/components/ui/switch'
import { NotificationsGroup } from '@/features/device-registrations/notifications-group'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { saveMessages } from '@/lib/save-messages'
import { cn } from '@/lib/utils'
import { FixtureQuery } from '../fixture-query'
import { NOW, SESSION_EXPIRES } from '../lab-fixtures'
import {
  quietEffect,
  quietScope,
  quietStatus,
  quietWindow,
  type DeviceCase,
  type QuietHoursState,
} from './quiet-hours-model'

/** Keeps this device's Off switch enabled, as it is on Settings. */
const turnOn = () => {}

/** The group heading in sentence case; the build applies it to every Settings group. */
const groupHeading = 'px-1 text-body-sm leading-none font-bold text-muted-foreground'

function QuietHoursGroup({ state }: { state: QuietHoursState }) {
  const on = state === 'on'
  const StatusIcon = on ? MoonStar : Moon
  return (
    <section className="flex flex-col gap-2">
      <h2 className={groupHeading}>Quiet hours</h2>
      <Card className="gap-0 py-0">
        <ItemGroup className="gap-0">
          <Item role="listitem" className="gap-3 rounded-none border-0 px-3.5 py-3">
            <ItemMedia className="size-9 self-start rounded-sm bg-secondary text-secondary-foreground [&>svg]:size-4.5">
              <Moon aria-hidden="true" />
            </ItemMedia>
            <ItemContent className="min-w-0 gap-1">
              <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex min-w-0 flex-col">
                  <ItemTitle className="tabular-nums">{quietWindow}</ItemTitle>
                  {/* Icon and word together, so the status never rests on color. */}
                  <span
                    className={cn(
                      'flex items-center gap-1 text-body-sm font-bold text-muted-foreground [&>svg]:size-4',
                      on && 'text-dose-taken-foreground',
                    )}
                  >
                    <StatusIcon aria-hidden="true" />
                    {quietStatus[state]}
                  </span>
                </div>
                <Switch
                  checked={on}
                  disabled={state === 'turning-on'}
                  aria-label="Quiet hours on all your devices"
                />
              </div>
              <p className="text-caption text-muted-foreground">{quietEffect}</p>
            </ItemContent>
          </Item>
        </ItemGroup>
      </Card>
      {state === 'unconfirmed' && (
        <Alert variant="destructive" className="mt-1">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{saveMessages.mightNotHaveSaved}</AlertTitle>
          <AlertDescription>{saveMessages.retrySameSave}</AlertDescription>
        </Alert>
      )}
      <p className="px-1 text-caption text-muted-foreground">{quietScope}</p>
    </section>
  )
}

/** Settings with quiet hours under Notifications, beside this device's `device` case. */
export function QuietHoursSettings({
  quiet,
  device,
}: {
  quiet: QuietHoursState
  device: DeviceCase
}) {
  return (
    <FixtureQuery now={NOW}>
      <AppShell current="/settings">
        {/* Production group headings are uppercase eyebrows; the approved design is sentence case. */}
        <section className="space-y-5 [&_h2]:text-body-sm [&_h2]:font-bold [&_h2]:tracking-normal [&_h2]:normal-case">
          <AppHeader title="Settings" />
          <NotificationsGroup state={device} onTurnOn={turnOn} />
          <QuietHoursGroup state={quiet} />
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
            {/* Lab copy of AuthControl's Sign out at rest, with the approved icon. */}
            <Button type="button" variant="outline" size="lg" className="w-full">
              <LogOut aria-hidden="true" data-icon="inline-start" />
              Sign out
            </Button>
            <p className="text-caption text-muted-foreground">
              Signs out this browser only. Google and other devices stay signed in.
            </p>
          </div>
        </section>
      </AppShell>
    </FixtureQuery>
  )
}
