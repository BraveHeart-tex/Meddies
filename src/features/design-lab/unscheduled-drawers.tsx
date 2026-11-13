'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import type { UnscheduledDose } from '@/features/unscheduled-doses/contract'
import { TODAY } from './lab-fixtures'
import {
  DoseFields,
  LabDoseDrawer,
  NotOnScheduleChip,
  RemoveConfirm,
  type SaveStep,
} from './unscheduled-parts'
import { ibuprofen, medicines, savedValues, type DoseValues } from './unscheduled-model'

/**
 * Log a dose from Medication detail (241·A3, A4, S1, S4 to S6): the Taken drawer without a
 * scheduled time, its muted line reading "Not on a schedule".
 */
export function LogDrawer({
  medicine,
  now,
  initial,
  validated,
  step = 'idle',
  back,
}: {
  medicine: Medicine
  /** Istanbul local minute. */
  now: string
  initial: DoseValues
  validated?: boolean
  step?: SaveStep
  back: string
}) {
  const router = useRouter()
  return (
    <LabDoseDrawer medicine={medicine} triggerId="log-dose" saving={step === 'saving'}>
      <NotOnScheduleChip step={step} today={TODAY} />
      <DoseFields
        medicine={medicine}
        now={now}
        initial={initial}
        validated={validated}
        step={step}
        save="Save dose"
        retry="Try saving the dose again"
        onCancel={() => router.push(back)}
      />
    </LabDoseDrawer>
  )
}

/**
 * Tapping an Unscheduled dose on Today or History (241·A8, A9, S8, S9): its fields at once, with
 * Remove dose below and a confirm step before it removes.
 */
export function ChangeDrawer({
  dose,
  confirm,
  step = 'idle',
  back,
  removeHref,
}: {
  dose: UnscheduledDose
  /** Shows Remove dose's confirm step. */
  confirm: boolean
  step?: SaveStep
  back: string
  removeHref: string
}) {
  const router = useRouter()
  const medicine = medicines.find((item) => item.id === dose.medicineId) ?? ibuprofen
  return (
    <LabDoseDrawer medicine={medicine} triggerId="change-dose" saving={step === 'saving'}>
      <NotOnScheduleChip step={step} dose={dose} today={TODAY} />
      {confirm ? (
        <RemoveConfirm
          dose={dose}
          medicine={medicine}
          today={TODAY}
          step={step}
          onKeep={() => router.push(back)}
        />
      ) : (
        <DoseFields
          medicine={medicine}
          now="2026-11-09T10:00"
          initial={savedValues(dose)}
          step={step}
          save="Save changes"
          retry="Try saving changes again"
          onCancel={() => router.push(back)}
          extra={
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="mt-3 w-full"
              onClick={() => router.push(removeHref)}
            >
              Remove dose
            </Button>
          }
        />
      )}
    </LabDoseDrawer>
  )
}
