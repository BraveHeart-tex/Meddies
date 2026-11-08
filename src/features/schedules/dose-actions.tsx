'use client'

import { useImperativeHandle, useRef, useState, type Ref } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { formatTime } from '@/lib/calendar-date'
import type { Medicine } from '@/features/medicines/contract'
import { saveMessages } from '@/lib/save-messages'
import { istanbulDate, type DoseOccurrence, type DoseOutcomeRecord } from './contract'
import { SkippedForm } from './skipped-form'
import { TakenForm } from './taken-form'
import { DoseDrawer } from './dose-drawer'
import { OutcomeChoice } from './outcome-choice'
import { outcomeConfirmation } from './dose-confirmation'
import { ScheduledChip } from './scheduled-chip'
import { RecordedElsewhere, RecordedOutcome } from './recorded-outcome'
import type { AttemptForm, RecordCheck } from './dose-saves'
import { useDoseDrawerDraft } from './use-dose-drawer-draft'
import { useDoseOutcomeMutation } from './use-dose-outcome-mutation'
import { useSchedulingClock } from './scheduling-clock'

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
  /** Reads the dose's view again after an unconfirmed save. */
  checkRecorded?: () => Promise<RecordCheck>
  onRecorded: (record: DoseOutcomeRecord) => boolean | void
  appearance?: 'row' | 'button'
  opener?: Ref<DoseDrawerOpener>
  todayDate?: string
  describedBy?: string
}) {
  const clock = useSchedulingClock()
  // Unsaved drawer details survive navigation for the session (FE-674).
  const draft = useDoseDrawerDraft(dose.id)
  const [editor, setEditor] = useState<Outcome | null>(draft.initial?.editor ?? null)
  const [correcting, setCorrecting] = useState(false)
  const [editingDose, setEditingDose] = useState<DoseOccurrence | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(draft.initial !== undefined)
  const rowTrigger = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const nowChoice = useRef<HTMLButtonElement>(null)
  const focusNowOnOpen = useRef(false)
  const [openedWithoutOutcome, setOpenedWithoutOutcome] = useState(!!draft.initial?.editor)
  const [savingOutcome, setSavingOutcome] = useState<Outcome>('Taken')
  const {
    submit,
    saving,
    error,
    needsReview,
    problem,
    attempt,
    clearFeedback,
    clearError,
    dismissReview,
    reviewCurrent,
    pinCorrection,
    resetRetry,
  } = useDoseOutcomeMutation({
    dose,
    medicine,
    drawerOpen,
    today: () => istanbulDate(clock.now()),
    refresh,
    checkRecorded,
    onRecorded(record) {
      // Also runs after Today unmounts, so a confirmed save never restores its draft.
      draft.discard()
      const superseded = onRecorded(record) === true
      // Confirmed by the server: a Toast without Undo (FE-648 F2, C5).
      toast.add({
        title: superseded
          ? 'Your earlier save went through. This dose has changed since then.'
          : outcomeConfirmation({
              label: medicine.label,
              unit: medicine.unit,
              previous: dose.status,
              record,
              today: istanbulDate(clock.now()),
            }),
        type: record.outcome === 'Taken' ? 'success' : 'skipped',
      })
    },
    onFinished() {
      draft.discard()
      setCorrecting(false)
      setEditingDose(null)
      setEditor(null)
      setDrawerOpen(false)
      setOpenedWithoutOutcome(false)
      // Up next's button now shows the following dose, so the close must not return to it (648·W4).
      returnFocus.current = rowTrigger.current
      requestAnimationFrame(() => rowTrigger.current?.focus())
    },
  })

  function save(outcome: Outcome, details: Record<string, unknown>, form?: AttemptForm) {
    setSavingOutcome(outcome)
    return submit(outcome, details, form)
  }

  function edit(outcome: Outcome | null) {
    setEditor(outcome)
    clearFeedback()
  }

  const recorded = dose.status === 'Taken' || dose.status === 'Skipped'
  const outcomeBlocked = (outcome: Outcome) =>
    saving ||
    needsReview ||
    (recorded && !openedWithoutOutcome && (!correcting || dose.status === outcome))

  function choose(outcome: Outcome) {
    edit(outcome)
    if (recorded) return
    setOpenedWithoutOutcome(true)
    draft.write(outcome)
  }

  function closeEditor(open: boolean) {
    if (open) return
    draft.discard()
    edit(null)
    setOpenedWithoutOutcome(false)
    setDrawerOpen(false)
    if (correcting) {
      setCorrecting(false)
      pinCorrection(null)
    }
  }

  // Reopening an unconfirmed attempt shows its details with Retry (D13, F6).
  const unconfirmed = problem?.kind === 'uncertain' && attempt !== null && !needsReview
  function openDrawer() {
    returnFocus.current = rowTrigger.current
    focusNowOnOpen.current = false
    clearFeedback()
    setDrawerOpen(true)
    if (!recorded && unconfirmed && attempt) choose(attempt.outcome)
  }

  useImperativeHandle(opener, () => ({
    open(outcome: Outcome) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      // Taken on Up next starts at its form's first control (FE-648 Open rule).
      focusNowOnOpen.current = outcome === 'Taken'
      clearFeedback()
      setDrawerOpen(true)
      choose(outcome)
    },
  }))

  // An unconfirmed attempt's problem belongs to its own outcome's form only.
  const attemptMatches = (outcome: Outcome) =>
    problem?.kind !== 'uncertain' || !attempt || attempt.outcome === outcome
  const verb = recorded ? 'Review' : 'Record'
  const triggerLabel = `${verb} dose for ${medicine.label} scheduled at ${formatTime(dose.dueAt)}`
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
          onClick={openDrawer}
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
          onClick={openDrawer}
        >
          {verb} dose
        </Button>
      )}
      {!drawerOpen &&
        error &&
        !unconfirmed &&
        editor === null &&
        !correcting &&
        editingDose === null && (
          <Alert className="relative z-10 mt-1 basis-full [overflow-wrap:anywhere]">
            <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
              <p>{error}</p>
              {needsReview && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void refresh()
                    // A closed unconfirmed attempt ends here; a conflict only hides its button.
                    if (attempt) reviewCurrent()
                    else dismissReview()
                  }}
                >
                  {saveMessages.checkWhatsSaved}
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
        initialFocus={() => (focusNowOnOpen.current ? nowChoice.current : null)}
        finalFocus={returnFocus}
        onClose={() => {
          draft.discard()
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
        {needsReview && drawerOpen && (
          <Alert>
            <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
              <p>{error}</p>
              <Button type="button" variant="outline" onClick={reviewCurrent}>
                {saveMessages.checkWhatsSaved}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {openedWithoutOutcome && recorded && editor !== null && <RecordedElsewhere dose={dose} />}
        {recorded && (!correcting || needsReview) && (
          <>
            <RecordedOutcome dose={dose} unit={medicine.unit} today={istanbulDate(clock.now())} />
            <fieldset
              disabled={needsReview}
              data-base-ui-swipe-ignore="y"
              className="flex min-w-0 flex-wrap gap-2.5"
            >
              {(dose.status === 'Taken' || editingDose !== null) &&
                (editingDose ?? dose).status === 'Taken' && (
                  <TakenForm
                    dose={editingDose ?? dose}
                    medicine={medicine}
                    open={editingDose !== null}
                    saving={saving}
                    reviewRequired={needsReview}
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
                  aria-label={`Change dose for ${medicine.label} at ${formatTime(dose.dueAt)}`}
                  onClick={() => {
                    pinCorrection({
                      outcome: dose.status,
                      revision: dose.record.revision ?? 0,
                    })
                    setCorrecting(true)
                  }}
                >
                  Change this dose
                </Button>
              )}
            </fieldset>
          </>
        )}
        {choosing && (
          <OutcomeChoice
            doseId={dose.id}
            value={editor}
            disabled={outcomeBlocked}
            onChoose={choose}
          />
        )}
        {(!recorded || correcting || editor === 'Taken') && (
          <TakenForm
            dose={dose}
            medicine={medicine}
            nowRef={nowChoice}
            open={editor === 'Taken'}
            saving={saving}
            reviewRequired={needsReview}
            problem={editor === 'Taken' && attemptMatches('Taken') ? problem : null}
            mode={correcting && recorded ? 'correct' : 'record'}
            restore={attempt?.outcome === 'Taken' ? attempt.form : undefined}
            // An unconfirmed attempt's own values win over any draft (D13).
            draftKey={correcting || attempt?.outcome === 'Taken' ? null : draft.takenKey}
            onOpen={closeEditor}
            onSubmit={(details, form) => save('Taken', details, form)}
          />
        )}
        {(!recorded || correcting || editor === 'Skipped') && (
          <SkippedForm
            dose={dose}
            medicine={medicine}
            open={editor === 'Skipped'}
            saving={saving}
            reviewRequired={needsReview}
            problem={editor === 'Skipped' && attemptMatches('Skipped') ? problem : null}
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
                Choose what happened
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
