'use client'

import { Archive, CalendarCog, Pencil, ScrollText, Trash2, Weight } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { Button } from '@/components/ui/button'
import { LoadingSection, Skeleton } from '@/components/ui/skeleton'
import type { Medicine } from '@/features/medicines/contract'
import {
  MedicationInsetGroup,
  MedicationInsetRow,
} from '@/features/medicines/medication-inset-list'
import {
  MedicationBackRow,
  MedicationIdentity,
  ScheduleUnchecked,
} from '@/features/medicines/medication-sub-screen'
import {
  medicationRecordHref,
  medicationSetupHref,
  medicationsHref,
} from '@/features/medicines/routes'
import type { DailySchedule } from './contract'
import { ManageScheduleRows } from './schedule-actions'

/**
 * Medication detail's Manage sub-screen, `?medicine=ID&manage` (403·B14): Back names the
 * medication and the identity carries the "Manage" eyebrow. The Schedule group holds the schedule
 * changes, or Set schedule for a medication with none; the Details group Edit details and Change
 * strength with their consequence lines, then Strength history. Archive medication follows, and
 * Delete medication only for a medication never scheduled or dosed (#292).
 */
export function MedicationManage({
  medicine,
  schedule,
  ended,
  paused,
  unscheduled,
  loading,
  loadError,
  onRetry,
  refreshAlerts,
  headingRef,
  onArchiveRequested,
  onDeleteRequested,
}: {
  medicine: Medicine
  schedule?: DailySchedule
  ended: boolean
  paused: boolean
  unscheduled: boolean
  loading: boolean
  loadError: boolean
  onRetry: () => void
  refreshAlerts: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
  onArchiveRequested?: (medicine: Medicine) => void
  onDeleteRequested?: (medicine: Medicine) => void
}) {
  const canDelete = medicine.everHadSchedule === false && medicine.everHadDose === false
  return (
    <div className="flex flex-col gap-5 [overflow-wrap:anywhere]">
      <MedicationBackRow href={medicationsHref({ mode: 'detail', medicineId: medicine.id })}>
        {medicine.label}
      </MedicationBackRow>
      <MedicationIdentity medicine={medicine} eyebrow="Manage" headingRef={headingRef} />
      {refreshAlerts}
      {loading ? (
        <LoadingSection label="Loading schedule">
          <Skeleton className="h-14 rounded-2xl" />
        </LoadingSection>
      ) : loadError ? (
        <ScheduleUnchecked name={medicine.label} onRetry={onRetry} />
      ) : (
        <MedicationInsetGroup title="Schedule">
          {schedule ? (
            <ManageScheduleRows
              medicine={medicine}
              schedule={schedule}
              ended={ended}
              paused={paused}
            />
          ) : (
            unscheduled && (
              <MedicationInsetRow
                icon={CalendarCog}
                label="Set schedule"
                href={medicationSetupHref(medicine.id)}
              />
            )
          )}
        </MedicationInsetGroup>
      )}
      <MedicationInsetGroup title="Details">
        <MedicationInsetRow
          icon={Pencil}
          label="Edit details"
          description="Updates doses logged at the current strength."
          href={medicationRecordHref(medicine.id, 'fix', medicine.currentStrengthRevisionId)}
        />
        <MedicationInsetRow
          icon={Weight}
          label="Change strength"
          description="Earlier doses keep their saved strength."
          href={medicationRecordHref(medicine.id, 'strength')}
        />
        <MedicationInsetRow
          icon={ScrollText}
          label="Strength history"
          href={medicationRecordHref(medicine.id, 'history')}
        />
      </MedicationInsetGroup>
      <div className="flex flex-col gap-2.5">
        {typeof medicine.revision === 'number' && onArchiveRequested && (
          <Button
            id={`archive-medicine-${medicine.id}`}
            variant="ghost"
            size="lg"
            onClick={() => onArchiveRequested(medicine)}
          >
            <Archive data-icon="inline-start" />
            Archive medication
          </Button>
        )}
        {canDelete && onDeleteRequested && (
          <Button
            id={`delete-medicine-${medicine.id}`}
            variant="destructive"
            size="lg"
            onClick={() => onDeleteRequested(medicine)}
          >
            <Trash2 data-icon="inline-start" />
            Delete medication
          </Button>
        )}
      </div>
    </div>
  )
}
