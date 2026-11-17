'use client'

/**
 * The account's Quiet hours on Settings (#380 Direction A, built by #381): their own group right
 * under this device's notifications. One row titled by the fixed window, with the status word and
 * its icon under it (so it never rests on color), one short line on what changes and a switch at
 * the end. The switch never moves ahead of the server: while Turn on saves it stays off and
 * disabled, and while Turn off saves it stays on and disabled. The save alert sits right under the
 * card, above the note that quiet hours reach every device. Wording follows docs/copy.md and the
 * #35 quiet hours rules.
 */
import { Moon, MoonStar, TriangleAlert } from 'lucide-react'
import { SettingsHeading } from '@/components/layout/settings-heading'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { saveMessages } from '@/lib/save-messages'
import { cn } from '@/lib/utils'

/**
 * The saved value plus the Turn on and Turn off saves' moments. `loading` is the row before the
 * saved value is known.
 */
export type QuietHoursState =
  | 'loading'
  | 'off'
  | 'turning-on'
  | 'unconfirmed'
  | 'rejected'
  | 'on'
  | 'turning-off'
  | 'off-unconfirmed'
  | 'off-rejected'

type Shown = Exclude<QuietHoursState, 'loading'>

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

const alerts: Partial<Record<Shown, { title: string; body: string }>> = {
  unconfirmed: { title: saveMessages.mightNotHaveSaved, body: saveMessages.retrySameSave },
  rejected: { title: 'Quiet hours aren’t on.', body: 'Check your connection and try again.' },
  'off-unconfirmed': { title: saveMessages.mightNotHaveSaved, body: saveMessages.retrySameSave },
  'off-rejected': {
    title: 'Quiet hours aren’t off.',
    body: 'Check your connection and try again.',
  },
}

const isOn = (state: QuietHoursState) =>
  state === 'on' ||
  state === 'turning-off' ||
  state === 'off-unconfirmed' ||
  state === 'off-rejected'

/** The fixed window, 23:00 inclusive to 08:00 exclusive, Europe/Istanbul. */
const quietWindow = '23:00-08:00'

/**
 * The status word with its icon. Before the saved value loads, a placeholder holds its line
 * unannounced, as this device's row does.
 */
function Status({ state }: { state: QuietHoursState }) {
  if (state === 'loading')
    return (
      <div className="flex h-lh items-center text-body-sm">
        <Skeleton className="h-3 w-7 rounded-md" />
      </div>
    )
  const on = isOn(state)
  const Icon = on ? MoonStar : Moon
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-body-sm font-bold text-muted-foreground [&>svg]:size-4',
        on && 'text-dose-taken-foreground',
      )}
    >
      <Icon aria-hidden="true" />
      {status[state]}
    </span>
  )
}

/**
 * Renders one state. `offline` disables the switch and says why; `onChange` runs from the
 * switch's tap with the value it asks for.
 */
export function QuietHoursGroup({
  state,
  offline = false,
  onChange,
}: {
  state: QuietHoursState
  offline?: boolean
  onChange?: (quietHours: boolean) => void
}) {
  const shown = state === 'loading' ? undefined : state
  const on = isOn(state)
  const alert = shown && alerts[shown]
  return (
    <section className="flex flex-col gap-2">
      <SettingsHeading>Quiet hours</SettingsHeading>
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
                  <Status state={state} />
                </div>
                {shown && (
                  <Switch
                    checked={on}
                    disabled={
                      state === 'turning-on' || state === 'turning-off' || offline || !onChange
                    }
                    onCheckedChange={(checked) => checked !== on && onChange?.(checked)}
                    aria-label="Quiet hours on all your devices"
                  />
                )}
              </div>
              <p className="text-caption text-muted-foreground">
                Dose reminders still go out on time. Follow-ups are skipped, not sent later.
              </p>
              {shown && offline && (
                <p className="text-caption text-muted-foreground">
                  {on ? 'Connect to turn off.' : 'Connect to turn on.'}
                </p>
              )}
            </ItemContent>
          </Item>
        </ItemGroup>
      </Card>
      {alert && (
        <Alert variant="destructive" className="mt-1">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{alert.title}</AlertTitle>
          <AlertDescription>{alert.body}</AlertDescription>
        </Alert>
      )}
      <p className="px-1 text-caption text-muted-foreground">Applies to all your devices.</p>
    </section>
  )
}
