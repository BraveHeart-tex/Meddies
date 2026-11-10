'use client'

import type { ReactNode, Ref } from 'react'
import { ChevronRightIcon, MoonIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { cn } from '@/lib/utils'
import { istanbulDate } from './contract'
import { firstOvernightDose, intervalLabel, isOvernightDose } from './interval-preview'

/** The Every row's answer: '8 hours' or 'hour', or null until the text is a count of hours. */
export function intervalHoursAnswer(hours: string) {
  const value = hours.trim()
  const count = /^\d+$/.test(value) ? Number(value) : 0
  return count ? intervalLabel(count).replace('Every ', '') : null
}

/** The Starts row's answer: 'Today, 08:00', or null until both parts are chosen. */
export function intervalStartsAnswer(date: string, time: string, today: string) {
  if (!date || !time) return null
  return `${date === today ? 'Today' : formatShortDay(date, today)}, ${time}`
}

/** Full-screen setup header (764·C0): Cancel, then the medication and "Set schedule" centered. */
export function ScheduleSetupHeader({
  label,
  subtitle = 'Set schedule',
  onCancel,
}: {
  label: string
  subtitle?: string
  onCancel: () => void
}) {
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-10 -mx-5 grid grid-cols-[5.5rem_minmax(0,1fr)_5.5rem] items-center bg-background px-3 py-2">
      <Button
        type="button"
        variant="ghost"
        className="justify-self-start px-2 whitespace-nowrap [overflow-wrap:normal]"
        onClick={onCancel}
      >
        Cancel
      </Button>
      <div className="text-center">
        <h1
          id="schedule-heading"
          tabIndex={-1}
          className="text-heading font-extrabold outline-none"
        >
          {label}
        </h1>
        <p className="text-label font-bold text-muted-foreground">{subtitle}</p>
      </div>
    </header>
  )
}

/** One answer in the setup card; opens its sheet, and carries its own error (764·C1, C6). */
export function IntervalRow({
  ref,
  id,
  label,
  value,
  error,
  disabled,
  onClick,
}: {
  ref?: Ref<HTMLButtonElement>
  id: string
  label: string
  value: string | null
  error?: string
  disabled?: boolean
  onClick: () => void
}) {
  const errorId = `${id}-error`
  return (
    <li>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-label={`${label}: ${value ?? 'Choose'}`}
        aria-describedby={error ? errorId : undefined}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none active:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-70"
      >
        <span className="min-w-0 flex-1 text-body-lg font-bold">{label}</span>
        <span className={cn('text-body-lg font-extrabold', !value && 'text-primary')}>
          {value ?? 'Choose'}
        </span>
        <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      </button>
      {error && (
        <p id={errorId} className="px-4 pb-3 text-body-sm font-bold text-destructive">
          {error}
        </p>
      )}
    </li>
  )
}

/** The bottom sheet for one answer. Dismissing it is the same as Cancel. */
export function IntervalSheet({
  open,
  title,
  onCancel,
  onDone,
  children,
}: {
  open: boolean
  title: string
  onCancel: () => void
  onDone: () => void
  children: ReactNode
}) {
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onCancel()}>
      <DrawerContent>
        <div className="-mt-2 flex flex-col gap-4">
          <DrawerHeader className="-mx-2 grid min-h-12 grid-cols-[5rem_minmax(0,1fr)_5rem] items-center gap-0 text-center">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <DrawerTitle className="text-heading">{title}</DrawerTitle>
            <Button type="button" variant="ghost" onClick={onDone}>
              Done
            </Button>
          </DrawerHeader>
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/** Under a change's preview: what an Edit time keeps (767·A3, A5). */
export const CHANGE_KEEPS_EARLIER =
  "Changes start when you save. Doses before then, and any you've logged, stay as they are."

/**
 * "Next 3 doses" while setting up, with night doses marked (764·C1, C2, C8, C15, C16). A change
 * counts them from now and says what it keeps (767·A3, A5).
 */
export function NextDoses({
  doses,
  hours,
  today,
  after,
}: {
  doses: string[] | null
  /** An Interval schedule's hours, which mark its first overnight dose. */
  hours?: number
  today: string
  /** For a change: the live time the doses count from. */
  after?: string
}) {
  const night = doses && hours ? firstOvernightDose(doses[0], hours) : undefined
  return (
    <section aria-labelledby="next-doses-heading" aria-live="polite" className="flex flex-col px-1">
      <h2 id="next-doses-heading" className="text-body-sm font-extrabold text-muted-foreground">
        {after ? `Next 3 doses after ${formatTime(after)}` : 'Next 3 doses'}
      </h2>
      {doses ? (
        <ul className="divide-y">
          {doses.map((dose) => (
            <li key={dose} className="flex items-center justify-between gap-2 py-2.5">
              <span className="flex items-center gap-1.5 text-heading font-extrabold tabular-nums">
                {formatTime(dose)}
                {isOvernightDose(dose) && (
                  <MoonIcon aria-label="Overnight" className="size-4 text-muted-foreground" />
                )}
              </span>
              <span className="text-body-sm">
                {istanbulDate(new Date(dose)) === today ? 'Today' : formatShortDay(dose, today)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pt-2 text-body-sm text-muted-foreground">They&apos;ll show here.</p>
      )}
      {night && (
        <p className="pt-2 text-body-sm text-muted-foreground">
          Includes a dose overnight, at {formatTime(night)}.
        </p>
      )}
      {after && <p className="pt-2 text-body-sm text-muted-foreground">{CHANGE_KEEPS_EARLIER}</p>}
    </section>
  )
}

/** Cancel with edits asks first (764·C7). */
export function ScheduleDiscardDrawer({
  open,
  change = false,
  onKeepEditing,
  onDiscard,
}: {
  open: boolean
  /** Changes to the current Schedule version, which stays as it is (767). */
  change?: boolean
  onKeepEditing: () => void
  onDiscard: () => void
}) {
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onKeepEditing()}>
      <DrawerContent>
        <div className="-mt-2 flex flex-col gap-3">
          <DrawerHeader className="text-center">
            <DrawerTitle className="text-heading">
              {change ? 'Discard these changes?' : 'Discard this schedule?'}
            </DrawerTitle>
          </DrawerHeader>
          <p className="text-center text-body-sm text-muted-foreground">
            {change ? 'Your schedule stays as it is.' : "The details you entered won't be saved."}
          </p>
          <Button
            type="button"
            size="lg"
            variant="destructive"
            className="w-full"
            onClick={onDiscard}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="w-full"
            onClick={onKeepEditing}
          >
            Keep editing
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
