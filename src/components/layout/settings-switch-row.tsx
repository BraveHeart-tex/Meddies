/**
 * The Switch row of the Settings inset list (#384 Direction D): icon tile, title, status word with
 * its icon (so it never rests on color), a control at the end, then the row's lines and its own
 * save alert under them, so an alert is never read as another switch's. Rows after the first draw
 * the divider from after the icon tile.
 */
import { TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function SettingsSwitchRow({
  icon: Icon,
  title,
  status,
  control,
  children,
}: {
  icon: LucideIcon
  title: string
  status: ReactNode
  control?: ReactNode
  /** Lines and the save alert under the title. */
  children?: ReactNode
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
        {children}
      </ItemContent>
    </Item>
  )
}

/** The status word with its icon; On takes the Taken color. */
export function SwitchStatus({
  icon: Icon,
  on = false,
  children,
}: {
  icon: LucideIcon
  on?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-body-sm font-bold text-muted-foreground [&>svg]:size-4',
        on && 'text-dose-taken-foreground',
      )}
    >
      <Icon aria-hidden="true" />
      {children}
    </span>
  )
}

/**
 * Holds the status word's line, unannounced, before the value is known: the Settings fallback's
 * one status covers the route.
 */
export function StatusPlaceholder() {
  return (
    <div className="flex h-lh items-center text-body-sm">
      <Skeleton className="h-3 w-7 rounded-md" />
    </div>
  )
}

/** One short line under the title. */
export function SwitchLine({ children }: { children: ReactNode }) {
  return <p className="text-caption text-muted-foreground">{children}</p>
}

/** The row's save alert, under its lines. */
export function SaveAlert({ title, body }: { title: string; body: string }) {
  return (
    <Alert variant="destructive" className="mt-1">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  )
}
