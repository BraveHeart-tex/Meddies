'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Field, FieldTitle } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Medicine } from '@/features/medicines/contract'
import type { DailySchedule } from './contract'
import { IntervalScheduleForm } from './interval-schedule-form'
import { ScheduleForm, type ScheduleChange } from './schedule-form'
import {
  readScheduleKind,
  scheduleDraftBase,
  scheduleKindOf,
  writeScheduleKind,
  type ScheduleKind,
} from './schedule-setup-drafts'
import { useScheduleAttempt } from './use-schedule-save'

/**
 * "When do you take it?" and the form for that answer (212·C0, C1). Opens on Set times, or a
 * change on the current Schedule version's kind (215·A2, A4), unless a save or a draft from this
 * session is for the other kind.
 */
export function ScheduleKindForms({
  medicine,
  today,
  serverNow,
  onSaved,
  onConflict,
  change,
}: {
  medicine: Medicine
  today: string
  serverNow: string
  onSaved: (schedule: DailySchedule) => void
  onConflict: () => void
  change?: ScheduleChange
}) {
  const client = useQueryClient()
  const current = change?.current
  const attempt = useScheduleAttempt(medicine.id, current)
  const base = scheduleDraftBase(medicine.id, current)
  const fallback = scheduleKindOf(current)
  const [kind, setKind] = useState<ScheduleKind>(
    () => attempt.kind ?? readScheduleKind(client, base, fallback),
  )
  return (
    <>
      {kind === 'times' && !change && (
        <p className="text-body-sm text-pretty text-muted-foreground">
          Times are Istanbul time. Doses start from the next time after you save. Earlier times
          today aren&apos;t added.
        </p>
      )}
      <Field>
        <FieldTitle
          id="schedule-kind-label"
          className="text-body-sm font-bold text-muted-foreground"
        >
          When do you take it?
        </FieldTitle>
        <ToggleGroup
          variant="outline"
          spacing={1.5}
          className="grid w-full grid-cols-2"
          aria-labelledby="schedule-kind-label"
          disabled={attempt.pending}
          value={[kind]}
          onValueChange={(next) => {
            const choice = next[0] as ScheduleKind | undefined
            if (!choice) return
            setKind(choice)
            writeScheduleKind(client, base, choice, fallback)
          }}
        >
          <ToggleGroupItem value="times">Set times</ToggleGroupItem>
          <ToggleGroupItem value="interval">Every few hours</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      {kind === 'times' ? (
        <ScheduleForm
          medicine={medicine}
          today={today}
          serverNow={serverNow}
          onSaved={onSaved}
          onConflict={onConflict}
          change={change}
        />
      ) : (
        <IntervalScheduleForm
          medicine={medicine}
          today={today}
          serverNow={serverNow}
          onSaved={onSaved}
          onConflict={onConflict}
          change={change}
        />
      )}
    </>
  )
}
