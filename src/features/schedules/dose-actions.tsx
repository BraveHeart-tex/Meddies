'use client'

import { useImperativeHandle, useRef, useState, type Ref } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { toast } from '@/components/ui/toast'
import { dateLabel } from '@/lib/calendar-date'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Medicine } from '@/features/medicines/contract'
import { istanbulDate, type DoseOccurrence, type DoseOutcomeRecord } from './contract'
import { SkippedForm } from './skipped-form'
import { doseClock, TakenForm } from './taken-form'
import { DoseDrawer } from './dose-drawer'
import { outcomeConfirmation } from './dose-confirmation'
import { ScheduledChip } from './scheduled-chip'
import { useDoseOutcomeMutation, type RecordCheck } from './use-dose-outcome-mutation'

type Outcome = DoseOutcomeRecord['outcome']
export type DoseDrawerOpener = { open: (outcome: Outcome) => void }

export function DoseActions({
  dose,
  medicine,
  refresh,
  checkRecorded,
  onRecorded,
  appearance = 'button',
  opener,
  todayDate,
  describedBy,
}: {
  dose: DoseOccurrence
  medicine: Medicine
  refresh: () => Promise<boolean>
  /** Reloads once after an uncertain new outcome (Today only). */
  checkRecorded?: () => Promise<RecordCheck>
  onRecorded: (record: DoseOutcomeRecord) => void
  appearance?: 'row' | 'button'
  opener?: Ref<DoseDrawerOpener>
  todayDate?: string
  describedBy?: string
}) {
  const [editor, setEditor] = useState<Outcome | null>(null)
  const [correcting, setCorrecting] = useState(false)
  const [editingDose, setEditingDose] = useState<DoseOccurrence | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const rowTrigger = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const [openedWithoutOutcome, setOpenedWithoutOutcome] = useState(false)
  const [savingOutcome, setSavingOutcome] = useState<Outcome>('Taken')
  const {
    submit,
    saving,
    error,
    needsReview,
    problem,
    clearFeedback,
    clearError,
    dismissReview,
    pinCorrection,
    resetRetry,
  } = useDoseOutcomeMutation({
    dose,
    refresh,
    checkRecorded,
    onRecorded(record) {
      // Confirmed by the server: a Toast without Undo (FE-648 F2, C5).
      toast.add({
        title: outcomeConfirmation({
          label: medicine.label,
          unit: medicine.unit,
          previous: dose.status,
          record,
        }),
        type: record.outcome === 'Taken' ? 'success' : 'skipped',
      })
      onRecorded(record)
    },
    onFinished() {
      setCorrecting(false)
      setEditingDose(null)
      setEditor(null)
      setDrawerOpen(false)
      setOpenedWithoutOutcome(false)
      requestAnimationFrame(() => rowTrigger.current?.focus())
    },
  })

  function save(outcome: Outcome, details: Record<string, unknown>) {
    setSavingOutcome(outcome)
    return submit(outcome, details)
  }

  function edit(outcome: Outcome | null) {
    setEditor(outcome)
    clearFeedback()
  }

  const recorded = dose.status === 'Taken' || dose.status === 'Skipped'
  const outcomeBlocked = (outcome: Outcome) =>
    saving || (recorded && !openedWithoutOutcome && (!correcting || dose.status === outcome))

  function choose(outcome: Outcome) {
    edit(outcome)
    if (!recorded) setOpenedWithoutOutcome(true)
  }

  function closeEditor(open: boolean) {
    if (open) return
    edit(null)
    setOpenedWithoutOutcome(false)
    setDrawerOpen(false)
    if (correcting) {
      setCorrecting(false)
      pinCorrection(null)
    }
  }

  useImperativeHandle(opener, () => ({
    open(outcome: Outcome) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      clearFeedback()
      setDrawerOpen(true)
      choose(outcome)
    },
  }))

  const verb = recorded ? 'Review' : 'Record'
  const triggerLabel = `${verb} dose for ${medicine.label} scheduled at ${doseClock(dose.dueAt)}`
  const choosing = !recorded || correcting || (openedWithoutOutcome && editor !== null)

  return (
    <div className={appearance === 'row' ? 'contents' : undefined}>
      {appearance === 'row' ? (
        <button
          ref={rowTrigger}
          id={`dose-actions-${dose.id}`}
          type="button"
          data-row-trigger
          aria-describedby={describedBy}
          className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          aria-label={triggerLabel}
          onClick={() => {
            returnFocus.current = rowTrigger.current
            clearFeedback()
            setDrawerOpen(true)
          }}
        >
          <span className="sr-only">{verb} dose</span>
        </button>
      ) : (
        <Button
          ref={rowTrigger}
          id={`dose-actions-${dose.id}`}
          type="button"
          variant="outline"
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          aria-label={triggerLabel}
          onClick={() => {
            returnFocus.current = rowTrigger.current
            clearFeedback()
            setDrawerOpen(true)
          }}
        >
          {verb} dose
        </Button>
      )}
      {!drawerOpen && error && editor === null && !correcting && editingDose === null && (
        <Alert className="relative z-10 mt-1 basis-full [overflow-wrap:anywhere]">
          <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
            <p>{error}</p>
            {needsReview && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void refresh()
                  dismissReview()
                }}
              >
                Review current outcome
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      <DoseDrawer
        open={drawerOpen}
        saving={saving}
        triggerId={`dose-actions-${dose.id}`}
        medicineId={medicine.id}
        title={medicine.label}
        description={[medicine.strength, medicine.unit].filter(Boolean).join(' · ')}
        finalFocus={returnFocus}
        onClose={() => {
          setDrawerOpen(false)
          setEditor(null)
          setCorrecting(false)
          setEditingDose(null)
          setOpenedWithoutOutcome(false)
        }}
      >
        <ScheduledChip
          dose={dose}
          today={todayDate}
          savingOutcome={saving ? savingOutcome : null}
          unconfirmed={problem?.kind === 'uncertain'}
        />
        {openedWithoutOutcome && recorded && editor !== null && (
          <Alert role="status">
            <AlertDescription className="text-foreground">
              This dose was recorded while your form was open. Your draft is still here; review the
              outcome before saving.
            </AlertDescription>
          </Alert>
        )}
        {recorded && !correcting && (
          <>
            <p className="font-extrabold">
              {dose.status === 'Taken' ? (
                <>
                  Taken {dose.record.quantity} {medicine.unit}
                  {dose.record.quantity === 1 ? '' : 's'} at{' '}
                  <time dateTime={dose.record.takenAt}>{doseClock(dose.record.takenAt)}</time>
                  {istanbulDate(new Date(dose.record.takenAt)) !==
                    istanbulDate(new Date(dose.dueAt)) &&
                    ` on ${dateLabel(
                      istanbulDate(new Date(dose.record.takenAt)),
                      istanbulDate(new Date(dose.dueAt)),
                    )}`}
                </>
              ) : (
                'Skipped. No intake recorded.'
              )}
            </p>
            <div data-base-ui-swipe-ignore="y" className="flex flex-wrap gap-2.5">
              {(dose.status === 'Taken' || editingDose !== null) &&
                (editingDose ?? dose).status === 'Taken' && (
                  <TakenForm
                    dose={editingDose ?? dose}
                    medicine={medicine}
                    open={editingDose !== null}
                    saving={saving}
                    problem={editingDose ? problem : null}
                    mode="edit"
                    onOpen={(open) => {
                      clearError()
                      if (open && dose.status === 'Taken') {
                        setEditingDose(dose)
                        pinCorrection({
                          outcome: 'Taken',
                          revision: dose.record.revision ?? 0,
                        })
                      }
                      if (!open) {
                        resetRetry()
                        pinCorrection(null)
                        setEditingDose(null)
                        setDrawerOpen(false)
                      }
                    }}
                    onSubmit={(details) => save('Taken', details)}
                  />
                )}
              {editingDose === null && (
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`Correct outcome for ${medicine.label} at ${doseClock(dose.dueAt)}`}
                  onClick={() => {
                    pinCorrection({
                      outcome: dose.status,
                      revision: dose.record.revision ?? 0,
                    })
                    setCorrecting(true)
                  }}
                >
                  Correct outcome
                </Button>
              )}
            </div>
          </>
        )}
        {choosing && (
          <div className="flex flex-col gap-2.5">
            <span id={`outcome-${dose.id}`} className="font-extrabold">
              {correcting && recorded ? `Change ${dose.status.toLowerCase()} to` : 'What happened?'}
            </span>
            <ToggleGroup
              data-base-ui-swipe-ignore="y"
              aria-labelledby={`outcome-${dose.id}`}
              variant="choice"
              size="lg"
              spacing={2.5}
              className="grid w-full grid-cols-2"
              value={editor ? [editor] : []}
              onValueChange={(value) => {
                const next = value[0] as Outcome | undefined
                if (next) choose(next)
              }}
            >
              {(['Taken', 'Skipped'] as const).map((outcome) => (
                <ToggleGroupItem
                  key={outcome}
                  value={outcome}
                  disabled={outcomeBlocked(outcome)}
                  className="w-full"
                >
                  {editor === outcome ? (
                    <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Icon
                        name={outcome === 'Taken' ? 'check' : 'skipped'}
                        size={14}
                        strokeWidth={2.4}
                      />
                    </span>
                  ) : (
                    <Icon
                      name={outcome === 'Taken' ? 'check' : 'skipped'}
                      size={24}
                      strokeWidth={1.4}
                      className="text-muted-foreground"
                    />
                  )}
                  {outcome === 'Taken' ? 'I took it' : 'I skipped it'}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}
        {(!recorded || correcting || editor === 'Taken') && (
          <TakenForm
            dose={dose}
            medicine={medicine}
            open={editor === 'Taken'}
            saving={saving}
            problem={editor === 'Taken' ? problem : null}
            mode={correcting && recorded ? 'correct' : 'record'}
            onOpen={closeEditor}
            onSubmit={(details) => save('Taken', details)}
          />
        )}
        {(!recorded || correcting || editor === 'Skipped') && (
          <SkippedForm
            dose={dose}
            medicine={medicine}
            open={editor === 'Skipped'}
            saving={saving}
            problem={editor === 'Skipped' ? problem : null}
            onOpen={closeEditor}
            onSubmit={() => void save('Skipped', {})}
            refresh={refresh}
          />
        )}
        {choosing && editor === null && (
          <div className="flex flex-col gap-4.5">
            <p className="py-1.5 text-center text-body-sm text-muted-foreground">
              Nothing is recorded until you choose and save.
            </p>
            <div className="flex flex-col gap-1.5">
              <Button type="button" size="drawer" className="w-full" disabled>
                Choose an outcome
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => closeEditor(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DoseDrawer>
    </div>
  )
}
