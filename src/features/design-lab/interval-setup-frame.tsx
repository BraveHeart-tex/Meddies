'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  IntervalFirstDateField,
  IntervalFirstTimeField,
  IntervalHoursField,
  IntervalQuantityField,
} from '@/features/schedules/interval-fields'
import {
  intervalHoursAnswer,
  NextDoses,
  IntervalRow,
  IntervalSheet,
  intervalStartsAnswer,
  ScheduleDiscardDrawer,
  ScheduleSetupHeader,
} from '@/features/schedules/interval-setup-parts'
import { quantityLabel } from '@/lib/dose-quantity'
import {
  magnesium,
  TODAY,
  useIntervalDraft,
  type IntervalFrameProps,
  type IntervalValues,
} from './interval-lab-model'
import { SetupFrame } from './interval-lab-parts'

type Sheet = 'every' | 'starts' | 'take'

const SHEET_TITLES: Record<Sheet, string> = { every: 'Every', starts: 'Starts', take: 'Take' }
const BLANK: IntervalValues = { hours: '', date: TODAY, time: '', quantity: '1' }

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
  const edited = JSON.stringify(draft.values) !== JSON.stringify(BLANK)
  return (
    <SetupFrame
      kind={kind}
      header={
        <ScheduleSetupHeader
          label={magnesium.label}
          onCancel={() => edited && setDiscardOpen(true)}
        />
      }
    >
      <ul className="divide-y rounded-xl border bg-card">
        <IntervalRow
          id="lab-every"
          label="Every"
          value={intervalHoursAnswer(hours)}
          error={draft.errors.hours}
          onClick={() => open('every')}
        />
        <IntervalRow
          id="lab-starts"
          label="Starts"
          value={intervalStartsAnswer(date, time, TODAY)}
          error={draft.errors.date ?? draft.errors.time}
          onClick={() => open('starts')}
        />
        <IntervalRow
          id="lab-take"
          label="Take"
          value={quantityLabel(Number(quantity) || 1, magnesium.unit)}
          onClick={() => open('take')}
        />
      </ul>
      <NextDoses doses={draft.doses} hours={Number(hours)} today={TODAY} />
      <Button
        type="button"
        size="lg"
        className="mt-auto mb-[calc(1rem+env(safe-area-inset-bottom,0px))] w-full whitespace-normal"
        onClick={() => draft.validate()}
      >
        Save schedule
      </Button>
      <IntervalSheet
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
            <IntervalHoursField
              value={hours}
              error={draft.errors.hours}
              onChange={(next) => draft.update({ hours: next })}
            />
            <p className="text-center text-body-sm text-muted-foreground">
              A late dose doesn&apos;t move later times.
            </p>
          </>
        )}
        {lastSheet === 'starts' && (
          <>
            <IntervalFirstDateField
              today={TODAY}
              value={date}
              error={draft.errors.date}
              onChange={(next) => draft.update({ date: next })}
            />
            <IntervalFirstTimeField
              value={time}
              error={draft.errors.time}
              onChange={(next) => draft.update({ time: next })}
            />
          </>
        )}
        {lastSheet === 'take' && (
          <IntervalQuantityField
            unit={magnesium.unit}
            value={quantity}
            onChange={(next) => draft.update({ quantity: next })}
          />
        )}
      </IntervalSheet>
      <ScheduleDiscardDrawer
        open={discardOpen}
        onKeepEditing={() => setDiscardOpen(false)}
        onDiscard={() => {
          draft.update(BLANK)
          setDiscardOpen(false)
        }}
      />
    </SetupFrame>
  )
}
