'use client'

import { useState, type ReactNode } from 'react'
import { ChevronRightIcon, MoonIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { istanbulDate } from '@/features/schedules/contract'
import { intervalLabel, nextIntervalDoses } from '@/features/schedules/interval-preview'
import { formatShortDay, formatTime, istanbulHour } from '@/lib/calendar-date'
import { quantityLabel } from '@/lib/dose-quantity'
import { cn } from '@/lib/utils'
import {
  magnesium,
  TODAY,
  useIntervalDraft,
  type IntervalDraft,
  type IntervalFrameProps,
  type IntervalValues,
} from './interval-lab-model'
import {
  FirstDateField,
  FirstTimeField,
  HoursField,
  QuantityField,
  SetupFrame,
} from './interval-lab-parts'

type Sheet = 'every' | 'starts' | 'take'

const SHEET_TITLES: Record<Sheet, string> = { every: 'Every', starts: 'Starts', take: 'Take' }
const BLANK: IntervalValues = { hours: '', date: TODAY, time: '', quantity: '1' }

const isNight = (dose: string) => {
  const hour = istanbulHour(dose)
  return hour >= 22 || hour < 7
}

const dayLabel = (dose: string) =>
  istanbulDate(new Date(dose)) === TODAY ? 'Today' : formatShortDay(dose, TODAY)

/** Checks a full day from the first dose, so a short list can't hide a night dose. */
function firstNightDose(first: string, hours: number) {
  return nextIntervalDoses({
    anchor: first,
    hours,
    now: new Date(Date.parse(first) - 1).toISOString(),
    count: Math.ceil(24 / hours),
  }).find(isNight)
}

function NextDoses({ draft }: { draft: IntervalDraft }) {
  const { doses, values } = draft
  const night = doses ? firstNightDose(doses[0], Number(values.hours)) : undefined
  return (
    <section aria-labelledby="next-doses-heading" aria-live="polite" className="flex flex-col px-1">
      <h2 id="next-doses-heading" className="text-body-sm font-extrabold text-muted-foreground">
        Next 3 doses
      </h2>
      {doses ? (
        <ul className="divide-y">
          {doses.map((dose) => (
            <li key={dose} className="flex items-center justify-between gap-2 py-2.5">
              <span className="flex items-center gap-1.5 text-heading font-extrabold tabular-nums">
                {formatTime(dose)}
                {isNight(dose) && (
                  <MoonIcon aria-label="Overnight" className="size-4 text-muted-foreground" />
                )}
              </span>
              <span className="text-body-sm">{dayLabel(dose)}</span>
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
    </section>
  )
}

function Row({
  label,
  value,
  error,
  onClick,
}: {
  label: string
  value: string | null
  error?: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none active:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span className="min-w-0 flex-1 text-body-lg font-bold">{label}</span>
        <span className={cn('text-body-lg font-extrabold', !value && 'text-primary')}>
          {value ?? 'Choose'}
        </span>
        <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      </button>
      {error && <p className="px-4 pb-3 text-body-sm font-bold text-destructive">{error}</p>}
    </li>
  )
}

function EditSheet({
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

/** Approved setup (764·C): three plain answers, each edited alone, and the doses they produce. */
export function IntervalSetupFrame({
  kind,
  values,
  errors,
  sheet: initialSheet = null,
  discard = false,
}: IntervalFrameProps & { sheet?: Sheet | null; discard?: boolean }) {
  const draft = useIntervalDraft(values, errors)
  const [sheet, setSheet] = useState<Sheet | null>(initialSheet)
  const [lastSheet, setLastSheet] = useState<Sheet>(initialSheet ?? 'every')
  const [snapshot, setSnapshot] = useState(draft.values)
  const [discardOpen, setDiscardOpen] = useState(discard)
  const open = (next: Sheet) => {
    setSnapshot(draft.values)
    setLastSheet(next)
    setSheet(next)
  }
  const cancelSheet = () => {
    draft.update(snapshot)
    setSheet(null)
  }
  const { hours, date, time, quantity } = draft.values
  const hoursCount = /^\d+$/.test(hours) ? Number(hours) : null
  const startsDay = date === TODAY ? 'Today' : date ? formatShortDay(date, TODAY) : null
  const edited = JSON.stringify(draft.values) !== JSON.stringify(BLANK)
  const header = (
    <header className="sticky top-0 z-10 -mx-5 grid grid-cols-[5.5rem_minmax(0,1fr)_5.5rem] items-center bg-background px-3 py-2">
      <Button
        type="button"
        variant="ghost"
        className="justify-self-start px-2 whitespace-nowrap [overflow-wrap:normal]"
        onClick={() => edited && setDiscardOpen(true)}
      >
        Cancel
      </Button>
      <div className="text-center">
        <h1 id="schedule-heading" className="text-heading font-extrabold">
          {magnesium.label}
        </h1>
        <p className="text-label font-bold text-muted-foreground">Set schedule</p>
      </div>
    </header>
  )
  return (
    <SetupFrame kind={kind} header={header}>
      <ul className="divide-y rounded-xl border bg-card">
        <Row
          label="Every"
          value={hoursCount ? intervalLabel(hoursCount).replace('Every ', '') : null}
          error={draft.errors.hours}
          onClick={() => open('every')}
        />
        <Row
          label="Starts"
          value={time && startsDay ? `${startsDay}, ${time}` : null}
          error={draft.errors.date ?? draft.errors.time}
          onClick={() => open('starts')}
        />
        <Row
          label="Take"
          value={quantityLabel(Number(quantity) || 1, magnesium.unit)}
          onClick={() => open('take')}
        />
      </ul>
      <NextDoses draft={draft} />
      <Button
        type="button"
        size="lg"
        className="mt-auto mb-[calc(1rem+env(safe-area-inset-bottom,0px))] w-full whitespace-normal"
        onClick={() => draft.validate()}
      >
        Save schedule
      </Button>
      <EditSheet
        open={sheet !== null}
        title={SHEET_TITLES[lastSheet]}
        onCancel={cancelSheet}
        onDone={() => {
          const fields = { every: ['hours'], starts: ['date', 'time'], take: [] } as const
          if (draft.validate([...fields[lastSheet]])) setSheet(null)
        }}
      >
        {lastSheet === 'every' && (
          <>
            <HoursField draft={draft} />
            <p className="text-center text-body-sm text-muted-foreground">
              A late dose doesn&apos;t move later times.
            </p>
          </>
        )}
        {lastSheet === 'starts' && (
          <>
            <FirstDateField draft={draft} />
            <FirstTimeField draft={draft} />
          </>
        )}
        {lastSheet === 'take' && <QuantityField draft={draft} />}
      </EditSheet>
      <Drawer open={discardOpen} onOpenChange={setDiscardOpen}>
        <DrawerContent>
          <div className="-mt-2 flex flex-col gap-3">
            <DrawerHeader className="text-center">
              <DrawerTitle className="text-heading">Discard this schedule?</DrawerTitle>
            </DrawerHeader>
            <p className="text-center text-body-sm text-muted-foreground">
              The details you entered won&apos;t be saved.
            </p>
            <Button
              type="button"
              size="lg"
              variant="destructive"
              className="w-full"
              onClick={() => {
                draft.update(BLANK)
                setDiscardOpen(false)
              }}
            >
              Discard
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => setDiscardOpen(false)}
            >
              Keep editing
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </SetupFrame>
  )
}
