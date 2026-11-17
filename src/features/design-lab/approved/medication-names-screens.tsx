'use client'

/**
 * #384 approved Direction D: this device's notifications, Quiet hours and Medication names as three
 * rows of one Notifications group, because they are all about reminders. This device comes first,
 * with its steps right under it; the two account-wide rows follow, and the note under the card
 * names them as reaching every device. Each row keeps the Switch row anatomy (icon tile, title,
 * status word with its icon, one line, a switch that never moves ahead of the server), and a save
 * alert sits inside the row it belongs to, so it is never read as another switch's.
 */
import type { ReactNode } from 'react'
import {
  Bell,
  BellOff,
  CircleSlash,
  Eye,
  EyeOff,
  Hourglass,
  Moon,
  ShieldCheck,
  Tag,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { SettingsFrame } from '@/app/settings/settings-frame'
import { SettingsRow } from '@/app/settings/settings-list'
import { SettingsHeading } from '@/components/layout/settings-heading'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Switch } from '@/components/ui/switch'
import { AuthControl } from '@/features/auth/controls'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { saveMessages } from '@/lib/save-messages'
import { cn } from '@/lib/utils'
import { FixtureQuery } from '../fixture-query'
import { NOW, SESSION_EXPIRES } from '../lab-fixtures'
import {
  accountScope,
  namesEffect,
  namesStatus,
  namesSwitchLabel,
  namesTitle,
  quietEffect,
  quietTitle,
  type DeviceCase,
  type MedicationNamesState,
} from './medication-names-model'

/** Keeps switches enabled, as they are on Settings. */
const change = () => {}

/** Medication names' status word with its icon; On takes the Taken color. */
function NamesStatus({ state }: { state: MedicationNamesState }) {
  const on = state === 'on'
  const Icon = on ? Eye : EyeOff
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-body-sm font-bold text-muted-foreground [&>svg]:size-4',
        on && 'text-dose-taken-foreground',
      )}
    >
      <Icon aria-hidden="true" />
      {namesStatus[state]}
    </span>
  )
}

function AccountRows() {
  return (
    <>
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
    </>
  )
}

function PlainStatus({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-body-sm font-bold text-muted-foreground [&>svg]:size-4">
      <Icon aria-hidden="true" />
      {children}
    </span>
  )
}

/** One Switch row; rows after the first draw the divider from after the icon tile. */
function SwitchRow({
  icon: Icon,
  title,
  status,
  line,
  control,
  alert,
}: {
  icon: LucideIcon
  title: string
  status: ReactNode
  line?: string
  control?: ReactNode
  alert?: ReactNode
}) {
  return (
    <Item
      role="listitem"
      className="gap-3 rounded-none border-0 px-3.5 py-3 not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-15.5 not-first:before:h-px not-first:before:bg-border"
    >
      <ItemMedia className="size-9 self-start rounded-sm bg-secondary text-secondary-foreground [&>svg]:size-4.5">
        <Icon aria-hidden="true" />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-1">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-col">
            <ItemTitle className="tabular-nums">{title}</ItemTitle>
            {status}
          </div>
          {control}
        </div>
        {line && <p className="text-caption text-muted-foreground">{line}</p>}
        {alert}
      </ItemContent>
    </Item>
  )
}

function NotificationsSection({
  names,
  device,
}: {
  names: MedicationNamesState
  device: DeviceCase
}) {
  return (
    <section className="flex flex-col gap-2">
      <SettingsHeading>Notifications</SettingsHeading>
      <Card className="gap-0 py-0">
        <ItemGroup className="gap-0">
          {device === 'off' ? (
            <SwitchRow
              icon={Bell}
              title="This device"
              status={<PlainStatus icon={BellOff}>Off</PlainStatus>}
              line="Asks permission first."
              control={
                <Switch
                  checked={false}
                  onCheckedChange={change}
                  aria-label="Notifications on this device"
                />
              }
            />
          ) : (
            <SwitchRow
              icon={Bell}
              title="This device"
              status={<PlainStatus icon={CircleSlash}>Not available in this browser</PlainStatus>}
            />
          )}
          <SwitchRow
            icon={Moon}
            title={quietTitle}
            status={<PlainStatus icon={Moon}>Off</PlainStatus>}
            line={quietEffect}
            control={
              <Switch
                checked={false}
                onCheckedChange={change}
                aria-label="Quiet hours on all your devices"
              />
            }
          />
          <SwitchRow
            icon={Tag}
            title={namesTitle}
            status={<NamesStatus state={names} />}
            line={namesEffect}
            control={
              <Switch
                checked={names === 'on'}
                disabled={names === 'turning-on'}
                onCheckedChange={change}
                aria-label={namesSwitchLabel}
              />
            }
            alert={
              names === 'unconfirmed' && (
                <Alert variant="destructive" className="mt-1">
                  <TriangleAlert aria-hidden="true" />
                  <AlertTitle>{saveMessages.mightNotHaveSaved}</AlertTitle>
                  <AlertDescription>{saveMessages.retrySameSave}</AlertDescription>
                </Alert>
              )
            }
          />
        </ItemGroup>
      </Card>
      <p className="px-1 text-caption text-muted-foreground">{accountScope}</p>
    </section>
  )
}

/** Settings with one Notifications group holding all three rows. */
export function MergedNotificationsSettings({
  names,
  device,
}: {
  names: MedicationNamesState
  device: DeviceCase
}) {
  return (
    <FixtureQuery now={NOW}>
      <SettingsFrame
        notifications={<NotificationsSection names={names} device={device} />}
        quietHours={null}
        account={<AccountRows />}
      >
        <AuthControl signedIn />
        <p className="text-caption text-muted-foreground">
          Signs out this browser only. Google and other devices stay signed in.
        </p>
      </SettingsFrame>
    </FixtureQuery>
  )
}
