import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'

/** One topic of the inset list: an eyebrow heading over a white group of rows. */
export function SettingsGroup({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-label leading-none tracking-eyebrow text-muted-foreground uppercase">
        {title}
      </h2>
      <Card className="gap-0 py-0">
        <ItemGroup className="gap-0">{children}</ItemGroup>
      </Card>
      {note && <p className="px-1 text-caption text-muted-foreground">{note}</p>}
    </section>
  )
}

/**
 * One fact per row. The value wraps under its label when both no longer fit. The divider starts
 * after the icon tile.
 */
export function SettingsRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: ReactNode
  children: ReactNode
}) {
  return (
    <Item
      role="listitem"
      className="gap-3 rounded-none border-0 px-3.5 py-2.5 not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-15.5 not-first:before:h-px not-first:before:bg-border"
    >
      <ItemMedia className="size-9 rounded-sm bg-secondary text-secondary-foreground [&>svg]:size-4.5">
        <Icon aria-hidden="true" />
      </ItemMedia>
      <ItemContent className="min-w-0 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <ItemTitle>{label}</ItemTitle>
        <div className="text-body-sm font-bold text-muted-foreground">{children}</div>
      </ItemContent>
    </Item>
  )
}
