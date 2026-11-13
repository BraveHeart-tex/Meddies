'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { discardSessionFormDraft, readSessionDraft } from '@/lib/session-drafts'
import { istanbulDate } from '../schedules/contract'
import { DoseDrawer } from '../schedules/dose-drawer'
import { useSchedulingClock } from '../schedules/scheduling-clock'
import { takenFormDefaults } from '../schedules/taken-form-schema'
import { NotOnScheduleChip } from './not-on-schedule-chip'
import { UnscheduledDoseForm } from './unscheduled-dose-form'
import { logDraftKey, logSaveKey } from './unscheduled-saves'
import { useUnscheduledSave } from './use-unscheduled-save'

const labels = { save: 'Save dose', retry: 'Try saving the dose again' }

/**
 * Log a dose on Medication detail (241·A1 to A4): an outline button under the schedule for any
 * medication, opening the dose drawer without a scheduled time. Unsaved details reopen the drawer
 * after navigation; dismissing it is its Clear form.
 */
export function LogDose({ medicine }: { medicine: Medicine }) {
  const client = useQueryClient()
  const clock = useSchedulingClock()
  const draftKey = logDraftKey(medicine.id)
  const [open, setOpen] = useState(() => readSessionDraft(client, draftKey) !== undefined)
  const trigger = useRef<HTMLButtonElement>(null)
  const triggerId = `log-dose-${medicine.id}`
  const save = useUnscheduledSave(logSaveKey(medicine.id), {
    medicine,
    onFinished() {
      setOpen(false)
      requestAnimationFrame(() => trigger.current?.focus())
    },
  })
  const restore = save.unconfirmed ? save.attempt?.form : undefined

  return (
    <>
      <Button
        ref={trigger}
        id={triggerId}
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden="true" data-icon="inline-start" />
        Log a dose
      </Button>
      <DoseDrawer
        open={open}
        saving={save.saving}
        triggerId={triggerId}
        medicineId={medicine.id}
        title={medicine.label}
        description={[medicine.strength, medicine.unit].filter(Boolean).join(' · ')}
        finalFocus={trigger}
        onClose={() => {
          discardSessionFormDraft(client, draftKey)
          save.dismiss()
          setOpen(false)
        }}
      >
        <NotOnScheduleChip
          saving={save.saving}
          unconfirmed={save.unconfirmed}
          today={istanbulDate(clock.now())}
        />
        <UnscheduledDoseForm
          medicine={medicine}
          defaults={takenFormDefaults(1)}
          saving={save.saving}
          problem={save.problem}
          conflict={save.conflict}
          labels={labels}
          restore={restore}
          // An unconfirmed attempt's own values win over any draft.
          draftKey={restore ? null : draftKey}
          onSubmit={(details, form) =>
            void save.submit({ kind: 'log', medicineId: medicine.id, ...details }, form)
          }
          onCancel={() => {
            discardSessionFormDraft(client, draftKey)
            save.dismiss()
            setOpen(false)
          }}
        />
      </DoseDrawer>
    </>
  )
}
