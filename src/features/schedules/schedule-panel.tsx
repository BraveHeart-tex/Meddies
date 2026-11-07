'use client'

import { Button } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { SchedulingClockProvider } from './scheduling-clock'
import { useScheduleSnapshot } from './use-schedule-snapshot'
import { TodaySchedule } from './today-schedule'
import { ScheduleSetupForm } from './schedule-setup-form'
import { weekdaySummary } from './weekdays'
import { MedicationRoutineGroups } from './medication-routine-groups'

export function SchedulePanel({
  medicines,
  mode = 'setup',
  initialMedicineId = '',
  medicinesLoading,
  medicinesError,
  retryMedicines,
  onScheduleSaved,
  initialNow,
}: {
  /** The server scheduling time at render, until a schedules snapshot replaces it. */
  initialNow: string
  medicines: Medicine[]
  mode?: 'today' | 'setup' | 'list' | 'detail'
  initialMedicineId?: string
  medicinesLoading: boolean
  medicinesError: boolean
  retryMedicines: () => void
  /** Runs after the server confirms a first schedule. */
  onScheduleSaved?: (medicine: Medicine) => void
}) {
  const snapshot = useScheduleSnapshot(initialNow)
  const { schedules, now, loading, loadError, retry: retrySchedules } = snapshot
  const selectedSchedule = schedules.find((schedule) => schedule.medicineId === initialMedicineId)
  const name = (id: string) => medicines.find((medicine) => medicine.id === id)?.label ?? 'Medicine'
  return (
    <SchedulingClockProvider serverNow={now}>
      <div className="space-y-10">
        {mode === 'today' && (
          <TodaySchedule
            snapshot={snapshot}
            name={name}
            medicines={medicines}
            medicinesLoading={medicinesLoading}
            medicinesError={medicinesError}
            retryMedicines={retryMedicines}
          />
        )}
        {mode === 'list' && (
          <section aria-labelledby="medicine-routines-heading" className="flex flex-col gap-4">
            <h2 id="medicine-routines-heading" className="sr-only">
              Your medicines
            </h2>
            {loading || medicinesLoading ? (
              <p role="status">Loading saved routines...</p>
            ) : medicinesError ? (
              <div role={medicines.length === 0 ? 'alert' : 'status'} className="space-y-2">
                <p>Your medicines could not be refreshed.</p>
                <Button variant="outline" className="min-h-11" onClick={retryMedicines}>
                  Retry loading medicines
                </Button>
              </div>
            ) : loadError ? (
              <div role="alert" className="space-y-2">
                <p>Saved routines could not be loaded.</p>
                <Button variant="outline" className="min-h-11" onClick={retrySchedules}>
                  Retry loading routines
                </Button>
              </div>
            ) : medicines.length === 0 ? (
              <p>No medicines saved yet.</p>
            ) : (
              <MedicationRoutineGroups medicines={medicines} schedules={schedules} />
            )}
          </section>
        )}
        {mode === 'detail' && (
          <section aria-labelledby="routine-heading" className="space-y-3 [overflow-wrap:anywhere]">
            <h2 id="routine-heading" className="text-xl font-semibold">
              Saved routine
            </h2>
            {loading || medicinesLoading ? (
              <p role="status">Loading saved routine...</p>
            ) : medicinesError ? (
              <div role="alert" className="space-y-2">
                <p>The medicine could not be loaded.</p>
                <Button variant="outline" className="min-h-11" onClick={retryMedicines}>
                  Retry loading medicine
                </Button>
              </div>
            ) : loadError ? (
              <div role="alert" className="space-y-2">
                <p>The saved routine could not be loaded.</p>
                <Button variant="outline" className="min-h-11" onClick={retrySchedules}>
                  Retry loading routine
                </Button>
              </div>
            ) : selectedSchedule ? (
              <div className="space-y-2 rounded-xl border bg-card p-4">
                <p>
                  {weekdaySummary(selectedSchedule.weekdays, 'long')} at{' '}
                  {selectedSchedule.times
                    .map((slot) => `${slot.time} (${slot.quantity})`)
                    .join(', ')}
                </p>
                <p className="text-sm text-muted-foreground">
                  Starts {selectedSchedule.startDate}.
                </p>
              </div>
            ) : medicines.some((item) => item.id === initialMedicineId) ? (
              <div className="space-y-2">
                <p>No schedule saved yet.</p>
                <a
                  className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-primary-foreground"
                  href={`/medications?schedule=${encodeURIComponent(initialMedicineId)}#schedule-heading`}
                >
                  Set schedule
                </a>
              </div>
            ) : (
              <p role="alert">This medicine could not be found.</p>
            )}
          </section>
        )}
        {mode === 'setup' && (
          <ScheduleSetupForm
            snapshot={snapshot}
            medicineId={initialMedicineId}
            medicines={medicines}
            medicinesLoading={medicinesLoading}
            medicinesError={medicinesError}
            retryMedicines={retryMedicines}
            onSaved={onScheduleSaved}
          />
        )}
      </div>
    </SchedulingClockProvider>
  )
}
