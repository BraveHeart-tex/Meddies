'use client'

import { ChevronRight, type LucideIcon } from 'lucide-react'
import { useId, type ReactNode, type Ref } from 'react'
import { SettingsHeading } from '@/components/layout/settings-heading'
import { Card } from '@/components/ui/card'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { cn } from '@/lib/utils'
import { MedicationsLink } from './medications-nav'

/**
 * Medication detail's inset lists (238·A3, 403·B14): a Settings-style group, an optional muted
 * heading over one card of divided rows, then an optional note.
 */
export function MedicationInsetGroup({
  title,
  note,
  children,
}: {
  title?: string
  note?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={title ? `${id}-heading` : undefined} className="flex flex-col gap-2">
      {title && <SettingsHeading id={`${id}-heading`}>{title}</SettingsHeading>}
      <Card className="gap-0 py-0">
        <ItemGroup className="gap-0">{children}</ItemGroup>
      </Card>
      {note && <p className="px-1 text-caption text-muted-foreground">{note}</p>}
    </section>
  )
}

// The divider starts after the icon tile.
const dividerClass =
  'relative not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-15.5 not-first:before:h-px not-first:before:bg-border'

/**
 * One inset row. `href` makes it a Medications link ending in a chevron; `onClick` a button with
 * no chevron, such as one that opens a confirm; neither, a fact with no action. The row is named
 * by its label and described by its consequence line and its value.
 */
export function MedicationInsetRow({
  icon: Icon,
  label,
  description,
  value,
  href,
  onClick,
  disabled,
  tone,
  ref,
}: {
  icon: LucideIcon
  label: string
  description?: ReactNode
  value?: ReactNode
  href?: string
  onClick?: () => void
  disabled?: boolean
  tone?: 'destructive'
  ref?: Ref<HTMLAnchorElement & HTMLButtonElement>
}) {
  const id = useId()
  const destructive = tone === 'destructive'
  const describedBy = [description && `${id}-description`, value && `${id}-value`]
    .filter(Boolean)
    .join(' ')
  const named = {
    'aria-labelledby': `${id}-label`,
    'aria-describedby': describedBy || undefined,
  }
  // The list item wraps the row, so a link or button keeps its own role.
  return (
    <div role="listitem" className={cn('group/row', dividerClass)}>
      <Item
        // The Card clips overflow, so the focus ring sits inside the row and follows its corners.
        className="min-h-14 gap-3 rounded-none border-0 px-3.5 py-2.5 text-left group-first/row:rounded-t-2xl group-last/row:rounded-b-2xl focus-visible:-outline-offset-2 disabled:opacity-50"
        render={
          href ? (
            <MedicationsLink ref={ref} href={href} {...named} />
          ) : onClick ? (
            <button ref={ref} type="button" disabled={disabled} onClick={onClick} {...named} />
          ) : undefined
        }
      >
        <ItemMedia
          className={cn(
            'size-9 rounded-sm bg-secondary text-secondary-foreground [&>svg]:size-4.5',
            destructive && 'bg-destructive/10 text-destructive',
          )}
        >
          <Icon aria-hidden="true" />
        </ItemMedia>
        <ItemContent className="min-w-0 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <ItemTitle id={`${id}-label`} className={cn(destructive && 'text-destructive')}>
              {label}
            </ItemTitle>
            {description && (
              <ItemDescription id={`${id}-description`}>{description}</ItemDescription>
            )}
          </div>
          {value && (
            <div id={`${id}-value`} className="text-body-sm font-bold text-muted-foreground">
              {value}
            </div>
          )}
        </ItemContent>
        {href && (
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        )}
      </Item>
    </div>
  )
}
