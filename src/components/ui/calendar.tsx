'use client'

import * as React from 'react'
import { DayPicker, getDefaultClassNames, type DayButton } from 'react-day-picker'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  dateValue,
  formatLongDay,
  formatMonthName,
  formatMonthYear,
  formatShortWeekday,
  formatWeekdayName,
} from '@/lib/calendar-date'
import { cn } from '@/lib/utils'

// Cozy Care calendar: 44px day targets that shrink only to fit a 320px phone, blush today,
// berry selected day, heavy caption.
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  formatters,
  labels,
  components,
  today,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>['variant']
  /** Istanbul today, as a calendar day: it marks the day and decides when a year shows. */
  today: Date
}) {
  const defaultClassNames = getDefaultClassNames()
  const todayValue = dateValue(today)

  return (
    <DayPicker
      today={today}
      showOutsideDays={showOutsideDays}
      className={cn(
        'group/calendar bg-card p-2 [--cell-radius:var(--radius-sm)] [--cell-size:min(2.75rem,calc((100vw_-_3.125rem)/7))] in-data-[slot=popover-content]:bg-transparent',
        className,
      )}
      captionLayout={captionLayout}
      formatters={{
        formatCaption: (month) => formatMonthYear(dateValue(month)),
        formatMonthDropdown: (month) => formatMonthName(dateValue(month)),
        formatWeekdayName: (weekday) => formatShortWeekday(dateValue(weekday)),
        ...formatters,
      }}
      labels={{
        labelDayButton: (day, modifiers) =>
          [
            formatLongDay(dateValue(day), todayValue),
            modifiers.today && 'today',
            modifiers.selected && 'selected',
          ]
            .filter(Boolean)
            .join(', '),
        labelGrid: (month) => formatMonthYear(dateValue(month)),
        labelWeekday: (weekday) => formatWeekdayName(dateValue(weekday)),
        ...labels,
      }}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn('relative flex flex-col gap-4', defaultClassNames.months),
        month: cn('flex w-full flex-col gap-2', defaultClassNames.month),
        nav: cn(
          'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant, size: 'icon' }),
          'size-(--cell-size) min-h-0 rounded-(--cell-radius) p-0 text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40',
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant, size: 'icon' }),
          'size-(--cell-size) min-h-0 rounded-(--cell-radius) p-0 text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40',
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          'flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-body-sm font-extrabold',
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn('relative rounded-(--cell-radius)', defaultClassNames.dropdown_root),
        dropdown: cn('absolute inset-0 bg-popover opacity-0', defaultClassNames.dropdown),
        caption_label: cn(
          'font-extrabold select-none',
          captionLayout === 'label'
            ? 'text-body-lg'
            : 'flex items-center gap-1 rounded-(--cell-radius) text-body-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
          defaultClassNames.caption_label,
        ),
        month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'flex-1 py-1 text-label font-bold text-muted-foreground select-none',
          defaultClassNames.weekday,
        ),
        week: cn('mt-1 flex w-full', defaultClassNames.week),
        day: cn(
          'group/day relative aspect-square size-(--cell-size) p-0 text-center select-none',
          defaultClassNames.day,
        ),
        today: cn('today', defaultClassNames.today),
        outside: cn('outside', defaultClassNames.outside),
        disabled: cn('disabled', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => (
          <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />
        ),
        Chevron: ({ className, orientation, ...props }) => {
          const Glyph =
            orientation === 'left'
              ? ChevronLeftIcon
              : orientation === 'right'
                ? ChevronRightIcon
                : ChevronDownIcon
          // The Cozy Care calendar keeps 20px chevrons within its 44px day controls.
          return (
            <Glyph
              aria-hidden="true"
              data-icon="inline-start"
              className={cn('size-5', className)}
              {...props}
            />
          )
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.isoDate}
      data-selected-single={modifiers.selected}
      data-today={modifiers.today}
      data-outside={modifiers.outside}
      data-disabled={modifiers.disabled}
      className={cn(
        'relative isolate z-10 size-(--cell-size) min-h-0 rounded-(--cell-radius) border-0 p-0 text-body-sm font-bold text-foreground tabular-nums active:not-aria-[haspopup]:scale-100',
        'data-[today=true]:data-[selected-single=false]:bg-accent data-[today=true]:font-extrabold data-[today=true]:data-[selected-single=false]:text-accent-foreground',
        'data-[outside=true]:font-semibold data-[outside=true]:text-muted-foreground',
        'data-[selected-single=true]:bg-primary data-[selected-single=true]:font-extrabold data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:hover:bg-primary-pressed',
        'data-[disabled=true]:font-semibold data-[disabled=true]:text-muted-foreground data-[disabled=true]:line-through data-[disabled=true]:opacity-60',
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
