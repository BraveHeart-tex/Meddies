'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Field, FieldTitle } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Medicine } from '@/features/medicines/contract'
import type { DailySchedule } from './contract'
import { IntervalScheduleForm } from './interval-schedule-form'
import { ScheduleForm } from './schedule-form'
import { readScheduleKind, writeScheduleKind, type ScheduleKind } from './schedule-setup-drafts'
import { useScheduleAttempt } from './use-schedule-save'

/**
 * "When do you take it?" and the form for that answer (764·C0, C1). Opens on Set times unless a
 * save or a draft from this session is for an Interval schedule.
 */
export function ScheduleKindForms({
  medicine,
  today,
  serverNow,
  onSaved,
  onConflict,
}: {
  medicine: Medicine
  today: string
  serverNow: string
  onSaved: (schedule: DailySchedule) => void
  onConflict: () => void
}) {
  const client = useQueryClient()
  const attempt = useScheduleAttempt(medicine.id)
  const [kind, setKind] = useState<ScheduleKind>(
    () => attempt.kind ?? readScheduleKind(client, medicine.id),
  )
  return (
    <>
      {kind === 'times' && (
        <p className="text-body-sm text-muted-foreground">
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
            writeScheduleKind(client, medicine.id, choice)
          }}
        >
          <ToggleGroupItem value="times">Set times</ToggleGroupItem>
          <ToggleGroupItem value="interval">Every few hours</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      {kind === 'times' ? (
        <ScheduleForm medicine={medicine} today={today} onSaved={onSaved} onConflict={onConflict} />
      ) : (
        <IntervalScheduleForm
          medicine={medicine}
          today={today}
          serverNow={serverNow}
          onSaved={onSaved}
          onConflict={onConflict}
        />
      )}
    </>
  )
}
