'use client'

import { Clock3, Plus } from 'lucide-react'
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Medicine } from '@/features/medicines/contract'
import {
  MedicationInsetGroup,
  MedicationInsetRow,
} from '@/features/medicines/medication-inset-list'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import {
  PausedBadge,
  ScheduleDateLines,
  pausedSinceLine,
} from '@/features/schedules/clock-schedule-card'
import type { DailySchedule } from '@/features/schedules/contract'
import { IntervalDoseList } from '@/features/schedules/interval-dose-list'
import {
  intervalAnchor,
  intervalLabel,
  nextIntervalDoses,
} from '@/features/schedules/interval-preview'
import { endedOn, nextDosesLabel, pausedOn, untilLastDay } from '@/features/schedules/last-day'
import { SchedulingClockProvider } from '@/features/schedules/scheduling-clock'
import { weekdaySummary } from '@/features/schedules/weekdays'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { formatQuantity, quantityLabel, unitName } from '@/lib/quantity-policy'
import { cn } from '@/lib/utils'
import { FixtureQuery } from '../fixture-query'
import { NOW, TODAY } from '../lab-fixtures'
import { detailCopy, detailFixtures, type StateData } from './medication-detail-model'

export const noop = () => {}

/** Scrolls the reviewed part into view so the 402x874 capture shows it. */
export function InView({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // jsdom has no scrollIntoView.
    ref.current?.scrollIntoView?.({ block: 'start' })
  }, [])
  return (
    <div ref={ref} className="scroll-mt-4">
      {children}
    </div>
  )
}

/** The tab shell around one Medication detail state, with its data seeded. */
export function DetailFrame({ data, children }: { data: StateData; children: ReactNode }) {
  return (
    <FixtureQuery {...detailFixtures(data)}>
      <SchedulingClockProvider serverNow={NOW}>
        <AppShell current="/medications">
          <ScreenStack>
            <div className="flex flex-col gap-5 [overflow-wrap:break-word]">{children}</div>
          </ScreenStack>
        </AppShell>
      </SchedulingClockProvider>
    </FixtureQuery>
  )
}

/** Back row and identity header; `back` names where Back goes. */
export function DetailTop({
  medicine,
  back = 'Medications',
  eyebrow,
}: {
  medicine: Medicine
  back?: string
  eyebrow?: string
}) {
  return (
    <>
      <MedicationBackRow href="/medications">{back}</MedicationBackRow>
      <MedicationIdentity medicine={medicine} eyebrow={eyebrow} />
    </>
  )
}

/** The identity header's placeholders in their final positions. */
export function IdentitySkeleton() {
  return (
    <div className="flex items-start gap-3">
      <Skeleton className="size-11.5 shrink-0 rounded-md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex h-[1lh] items-center text-title">
          <Skeleton className="h-5.5 w-full rounded-lg" />
        </div>
        <div className="flex h-[1lh] items-center text-body-sm">
          <Skeleton className="h-3.5 w-3/5 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

/** Production's inset group (#405). */
export const InsetGroup = MedicationInsetGroup

/**
 * Production's inset row (#405). `href` makes it a route link ending in a chevron; otherwise it
 * is a button that opens a Drawer, or with `readOnly` a fact with no action.
 */
export function InsetRow({
  readOnly = false,
  href,
  ...props
}: Omit<ComponentProps<typeof MedicationInsetRow>, 'onClick' | 'ref'> & { readOnly?: boolean }) {
  return <MedicationInsetRow {...props} href={href} onClick={href || readOnly ? undefined : noop} />
}

/** A future feature's place, drawn dashed with the issue that will fill it. */
export function SlotNote({
  issue,
  label,
  inset = false,
}: {
  issue: number
  label: string
  inset?: boolean
}) {
  return (
    <div
      className={cn(
        'flex min-h-11 items-center justify-between gap-3 rounded-xl border-[1.5px] border-dashed border-border-strong px-3.5 py-2 text-body-sm font-bold text-muted-foreground',
        inset && 'm-2',
      )}
    >
      <span>{label}</span>
      <span className="text-caption">#{issue}</span>
    </div>
  )
}

/** Log a dose in the weight a state gives it: berry, soft or outline. */
export function LogDoseButton({ variant }: { variant: 'default' | 'soft' | 'outline' }) {
  return (
    <Button type="button" variant={variant} size="lg" className="w-full" aria-haspopup="dialog">
      <Plus aria-hidden="true" data-icon="inline-start" />
      Log a dose
    </Button>
  )
}

/** One refresh-failed notice for the medication and its schedule together. */
export function RefreshAlert({ label }: { label: string }) {
  return (
    <Alert role="status">
      <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
        <p>{detailCopy.refresh(label)}</p>
        <Button variant="outline" className="min-h-11">
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  )
}

export type ScheduleView = {
  paused: string | null
  ended: string | null
  running: boolean
  interval: boolean
}

export function scheduleView(schedule: DailySchedule): ScheduleView {
  const ended = endedOn(schedule, TODAY)
  const paused = pausedOn(schedule, TODAY)
  return { ended, paused, running: !ended && !paused, interval: schedule.intervalHours != null }
}

/** The next Clock dose today or later, for the one direction that shows it. */
function nextClockDose(schedule: DailySchedule, medicine: Medicine) {
  const nowTime = formatTime(NOW)
  const slot = schedule.times.find((item) => item.time > nowTime) ?? schedule.times[0]
  return detailCopy.next(slot.time, quantityLabel(slot.quantity, medicine.unit))
}

/**
 * The schedule's facts as the production cards show them (Clock times or Interval next doses,
 * then date lines), without the Card, so a direction can add a title, actions or a footer.
 */
export function ScheduleFacts({
  medicine,
  schedule,
  showNext = false,
}: {
  medicine: Medicine
  schedule: DailySchedule
  showNext?: boolean
}) {
  const { paused, ended } = scheduleView(schedule)
  if (schedule.intervalHours != null) {
    const anchor = intervalAnchor(schedule)
    const doses = untilLastDay(
      nextIntervalDoses({ anchor, hours: schedule.intervalHours, now: NOW }),
      schedule.endDate ?? null,
    )
    const holding = Boolean(ended || paused)
    return (
      <div className="flex flex-col gap-3">
        {!holding && (
          <>
            <h3 className="text-body-sm font-extrabold">
              {nextDosesLabel(doses.length, schedule.endDate)}
            </h3>
            <IntervalDoseList doses={doses} today={TODAY} />
          </>
        )}
        <p className="text-body-sm">
          {quantityLabel(schedule.times[0].quantity, medicine.unit)} each time
        </p>
        <ScheduleDateLines
          started={
            paused
              ? pausedSinceLine(paused, TODAY)
              : `Started ${formatShortDay(anchor, TODAY)} at ${formatTime(anchor)}`
          }
          lastDay={schedule.endDate}
          ended={ended}
          today={TODAY}
        />
      </div>
    )
  }
  const upcoming = schedule.startDate > TODAY
  return (
    <div className="flex flex-col gap-3">
      {showNext && !paused && !ended && !upcoming && (
        <p className="flex items-center gap-1.5 text-body-sm font-extrabold text-foreground [&>svg]:size-4">
          <Clock3 aria-hidden="true" />
          {nextClockDose(schedule, medicine)}
        </p>
      )}
      <ul className="divide-y">
        {schedule.times.map((slot) => (
          <li key={slot.time} className="flex flex-wrap justify-between gap-2 py-3">
            <span className="text-heading font-extrabold">{slot.time}</span>
            <span className="text-body-sm">{quantityLabel(slot.quantity, medicine.unit)}</span>
          </li>
        ))}
      </ul>
      <ScheduleDateLines
        started={
          paused
            ? pausedSinceLine(paused, TODAY)
            : `${upcoming ? 'Starts' : 'Started'} ${formatShortDay(schedule.startDate, TODAY)}`
        }
        lastDay={schedule.endDate}
        ended={ended}
        today={TODAY}
      />
    </div>
  )
}

/** The schedule's summary line: days or interval, with the Paused badge while paused. */
export function ScheduleSummary({
  schedule,
  title = false,
}: {
  schedule: DailySchedule
  title?: boolean
}) {
  const { paused } = scheduleView(schedule)
  const summary =
    schedule.intervalHours != null
      ? intervalLabel(schedule.intervalHours)
      : weekdaySummary(schedule.weekdays, 'long')
  if (title)
    return (
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Schedule</CardTitle>
          {paused && <PausedBadge />}
        </div>
        <CardDescription>{summary}</CardDescription>
      </div>
    )
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-body-lg font-extrabold">{summary}</p>
      {paused && <PausedBadge />}
    </div>
  )
}

/** The stock count as a row value: "120 ml left", never in display type. */
export function stockValue(medicine: Medicine) {
  if (!medicine.stock?.tracked) return 'Not tracking'
  const { count } = medicine.stock
  return `${formatQuantity(count, medicine.unit)} ${unitName(count, medicine.unit)} left`
}
