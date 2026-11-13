'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import type { Medicine } from '@/features/medicines/contract'
import { formatTime } from '@/lib/calendar-date'
import { quantityLabel } from '@/lib/dose-quantity'
import { saveMessages } from '@/lib/save-messages'
import { discardSessionFormDraft, readSessionDraft } from '@/lib/session-drafts'
import type { SaveProblem } from '../schedules/dose-save-state'
import { DoseDrawer } from '../schedules/dose-drawer'
import { DoseSaveProblem } from '../schedules/dose-save-problem'
import { DoseStatusBadge } from '../schedules/dose-status-badge'
import { localMinute, takenFormDefaults } from '../schedules/taken-form-schema'
import type { UnscheduledDose } from './contract'
import { takenWhen } from './messages'
import { NotOnScheduleChip } from './not-on-schedule-chip'
import { UnscheduledDoseForm } from './unscheduled-dose-form'
import { changeDraftKey, conflictMessage, doseSaveKey } from './unscheduled-saves'
import { useUnscheduledSave } from './use-unscheduled-save'

const labels = { save: 'Save changes', retry: 'Try saving changes again' }

/**
 * An Unscheduled dose on Today or History (241·A5, A7): its taken time in the time column,
 * "· Not on a schedule" ending its detail line and a Taken badge. The row opens its drawer to
 * change the intake or remove the dose (241·A8, A9). `heading` matches the screen's outline.
 */
export function UnscheduledDoseRow({
  dose,
  medicine,
  today,
  heading: Heading,
  className,
  focusAfterRemove,
}: {
  dose: UnscheduledDose
  medicine?: Medicine
  today: string
  heading: 'h3' | 'h4'
  className?: string
  /** Where focus goes once a removal takes the row and its drawer away. */
  focusAfterRemove: string
}) {
  const client = useQueryClient()
  const draftKey = changeDraftKey(dose.id)
  const label = medicine?.label ?? 'Medication'
  const [open, setOpen] = useState(() => readSessionDraft(client, draftKey) !== undefined)
  const save = useUnscheduledSave(doseSaveKey(dose.id), {
    medicine: { label, unit: medicine?.unit ?? 'tablet' },
    onFinished() {
      setOpen(false)
      setConfirming(false)
    },
  })
  // An unconfirmed removal reopens on its confirm step, with its retry.
  const [confirming, setConfirming] = useState(save.attempt?.command.kind === 'remove')
  const trigger = useRef<HTMLButtonElement>(null)
  const time = formatTime(dose.takenAt)
  const triggerId = `unscheduled-dose-${dose.id}`
  const statusId = `unscheduled-status-${dose.id}`
  const pending = save.saving
    ? { id: dose.id, outcome: 'Taken' as const }
    : save.unconfirmed
      ? { id: dose.id, outcome: 'Taken' as const, unconfirmed: true }
      : undefined
  const local = localMinute(dose.takenAt)
  // Each step shows only its own attempt's problem.
  const attemptKind = save.attempt?.command.kind
  const restore = attemptKind === 'change' && save.unconfirmed ? save.attempt?.form : undefined

  function close() {
    discardSessionFormDraft(client, draftKey)
    save.dismiss()
    setConfirming(false)
    setOpen(false)
  }

  return (
    <Item render={<li data-dose-id={dose.id} />} variant="card" className={className}>
      <span aria-hidden="true" className="w-11.5 shrink-0 font-extrabold text-muted-foreground">
        <time dateTime={dose.takenAt}>{time}</time>
      </span>
      <ItemContent className="min-w-0 gap-0.75">
        <ItemTitle>
          <Heading id={`dose-${dose.id}`} tabIndex={-1} className="outline-none">
            <span className="sr-only">{time} · </span>
            {label}
          </Heading>
        </ItemTitle>
        <ItemDescription>
          {[medicine?.strength, medicine && quantityLabel(dose.quantity, medicine.unit)]
            .filter(Boolean)
            .join(' · ')}
          {' · Not on a schedule'}
        </ItemDescription>
      </ItemContent>
      <DoseStatusBadge
        id={statusId}
        className="max-w-full whitespace-normal max-[360px]:col-start-2 max-[360px]:justify-self-start"
        pending={pending}
        status="Taken"
      />
      {medicine && (
        <>
          <button
            ref={trigger}
            id={triggerId}
            type="button"
            data-row-trigger
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-describedby={statusId}
            aria-label={`Review dose for ${label} taken at ${time}, not on a schedule`}
            className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() => setOpen(true)}
          />
          <DoseDrawer
            open={open}
            saving={save.saving}
            triggerId={triggerId}
            medicineId={medicine.id}
            title={medicine.label}
            description={[medicine.strength, medicine.unit].filter(Boolean).join(' · ')}
            finalFocus={trigger}
            onClose={close}
          >
            <NotOnScheduleChip
              saving={save.saving}
              unconfirmed={save.unconfirmed}
              dose={dose}
              today={today}
            />
            {confirming ? (
              <RemoveConfirm
                dose={dose}
                medicine={medicine}
                today={today}
                saving={save.saving}
                problem={attemptKind === 'remove' ? save.problem : null}
                conflict={save.conflict}
                onRemove={() =>
                  void save.submit({ kind: 'remove', dose }).then((removed) => {
                    if (removed)
                      requestAnimationFrame(() =>
                        document.getElementById(focusAfterRemove)?.focus(),
                      )
                  })
                }
                onKeep={() => {
                  save.dismiss()
                  setConfirming(false)
                }}
              />
            ) : (
              <UnscheduledDoseForm
                medicine={medicine}
                defaults={takenFormDefaults(dose.quantity, { local })}
                original={{ local, instant: dose.takenAt }}
                saving={save.saving}
                problem={attemptKind === 'change' ? save.problem : null}
                conflict={save.conflict}
                labels={labels}
                restore={restore}
                draftKey={restore ? null : draftKey}
                onSubmit={(details, form) =>
                  void save.submit({ kind: 'change', dose, ...details }, form)
                }
                onCancel={close}
                extra={
                  <Button
                    type="button"
                    variant="destructive"
                    size="lg"
                    className="mt-3 w-full"
                    disabled={save.saving}
                    onClick={() => {
                      save.dismiss()
                      setConfirming(true)
                    }}
                  >
                    Remove dose
                  </Button>
                }
              />
            )}
          </DoseDrawer>
        </>
      )}
    </Item>
  )
}

/** Remove dose's confirm step in place of the fields (241·A9, S9). */
function RemoveConfirm({
  dose,
  medicine,
  today,
  saving,
  problem,
  conflict,
  onRemove,
  onKeep,
}: {
  dose: UnscheduledDose
  medicine: Medicine
  today: string
  saving: boolean
  problem: SaveProblem | null
  conflict: boolean
  onRemove: () => void
  onKeep: () => void
}) {
  const problemId = `remove-problem-${dose.id}`
  const uncertain = problem?.kind === 'uncertain'
  return (
    <div className="flex flex-col gap-4.5" aria-busy={saving}>
      <div className="flex flex-col gap-1.5">
        <p className="text-heading font-extrabold">Remove this dose?</p>
        <p className="text-body-sm text-muted-foreground">
          {quantityLabel(dose.quantity, medicine.unit)} at {takenWhen(dose, today)} leaves Today and
          History.
        </p>
      </div>
      {conflict ? (
        <Alert id={problemId} variant="destructive">
          <AlertDescription>{conflictMessage}</AlertDescription>
        </Alert>
      ) : uncertain ? (
        !saving && (
          <DoseSaveProblem id={problemId} outcome="Skipped" problem={problem} offline={false} />
        )
      ) : (
        problem && (
          <Alert id={problemId} variant="destructive">
            <AlertTitle>{saveMessages.notSaved}</AlertTitle>
            <AlertDescription>
              Close this and open the dose again to see what&apos;s saved.
            </AlertDescription>
          </Alert>
        )
      )}
      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          size="drawer"
          variant="destructive"
          className="w-full whitespace-normal"
          disabled={saving || conflict}
          aria-describedby={!saving && (problem || conflict) ? problemId : undefined}
          onClick={onRemove}
        >
          {saving ? 'Removing...' : uncertain ? 'Try removing again' : 'Remove dose'}
        </Button>
        <Button type="button" variant="ghost" className="w-full" disabled={saving} onClick={onKeep}>
          Keep dose
        </Button>
      </div>
    </div>
  )
}
