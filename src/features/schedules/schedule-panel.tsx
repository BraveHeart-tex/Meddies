'use client'

import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { Medicine } from '@/features/medicines/contract'
import { useMedicines } from '@/features/medicines/queries'
import { SchedulingClockProvider } from './scheduling-clock'
import { useScheduleSnapshot } from './queries'
import { TodaySchedule } from './today-schedule'
import { ScheduleSetupForm } from './schedule-setup-form'
import { istanbulDate } from './contract'
import { weekdaySummary } from './weekdays'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { medicationSetupHref } from '@/features/medicines/routes'
import { MedicationsList } from './medications-list'

export function SchedulePanel({
  mode = 'setup',
  initialMedicineId = '',
  onScheduleSaved,
  initialNow,
  serverEntry = false,
  focusMedicineId,
  onMedicineFocused,
}: {
  /** The server scheduling time at render, until a newer schedules snapshot replaces it. */
  initialNow: string
  mode?: 'today' | 'setup' | 'list' | 'detail'
  initialMedicineId?: string
  /** Runs after the server confirms a first schedule. */
  onScheduleSaved?: (medicine: Medicine) => void
  /** This render's server read already refreshed both queries. */
  serverEntry?: boolean
  focusMedicineId?: string | null
  onMedicineFocused?: () => void
}) {
  const schedulesRead = useScheduleSnapshot({ serverEntry: serverEntry || mode === 'today' })
  const {
    snapshot,
    schedules,
    loading,
    loadError,
    refreshFailed,
    refreshing,
    retry: retrySchedules,
  } = schedulesRead
  const medicinesRead = useMedicines({ serverEntry })
  const {
    medicines,
    loading: medicinesLoading,
    loadError: medicinesError,
    retry: retryMedicines,
  } = medicinesRead
  // The latest server scheduling time anchors the clock: a snapshot cached before this render
  // is older than `initialNow`, one read since is newer.
  const now = snapshot && snapshot.now > initialNow ? snapshot.now : initialNow
  const selectedSchedule = schedules.find((schedule) => schedule.medicineId === initialMedicineId)
  return (
    <SchedulingClockProvider serverNow={now}>
      <div className="space-y-10">
        {mode === 'today' && <TodaySchedule schedulesRead={schedulesRead} serverNow={now} />}
        {refreshFailed && mode === 'detail' && (
          <Alert role="status">
            <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
              <p>Your schedules didn&apos;t update just now. Showing the last list that loaded.</p>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={refreshing}
                onClick={retrySchedules}
              >
                {refreshing ? 'Retrying…' : 'Try loading schedules again'}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {mode === 'list' && (
          <MedicationsList
            medicinesRead={medicinesRead}
            schedulesRead={schedulesRead}
            focusMedicineId={focusMedicineId}
            onMedicineFocused={onMedicineFocused}
          />
        )}
        {mode === 'detail' && (
          <section aria-labelledby="routine-heading" className="space-y-3 [overflow-wrap:anywhere]">
            <h2 id="routine-heading" className="text-xl font-semibold">
              Schedule
            </h2>
            {loading || medicinesLoading ? (
              <p role="status">Loading schedule…</p>
            ) : medicinesError ? (
              <div role="alert" className="space-y-2">
                <p>
                  This medication didn&apos;t load just now. Check your connection and try again.
                </p>
                <Button variant="outline" className="min-h-11" onClick={retryMedicines}>
                  Try loading medication again
                </Button>
              </div>
            ) : loadError ? (
              <div role="alert" className="space-y-2">
                <p>This schedule didn&apos;t load just now. Check your connection and try again.</p>
                <Button variant="outline" className="min-h-11" onClick={retrySchedules}>
                  Try loading schedule again
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
                <p>No schedule yet.</p>
                <MedicationsLink
                  className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-primary-foreground"
                  href={medicationSetupHref(initialMedicineId)}
                >
                  Set schedule
                </MedicationsLink>
              </div>
            ) : (
              <p role="alert">This medication isn&apos;t in your list.</p>
            )}
          </section>
        )}
        {mode === 'setup' && (
          <ScheduleSetupForm
            schedulesRead={schedulesRead}
            today={istanbulDate(new Date(now))}
            medicineId={initialMedicineId}
            onSaved={onScheduleSaved}
            serverEntry={serverEntry}
          />
        )}
      </div>
    </SchedulingClockProvider>
  )
}
