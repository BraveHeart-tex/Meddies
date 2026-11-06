'use client'

import { useImperativeHandle, useRef, useState, type Ref } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Medicine } from '@/features/medicines/contract'
import {
  istanbulDate,
  parseDoseOutcomeRecord,
  type DoseOccurrence,
  type DoseOutcomeRecord,
} from './contract'
import { SkippedForm } from './skipped-form'
import { doseClock, TakenForm } from './taken-form'
import { DoseDrawer } from './dose-drawer'

type Outcome = DoseOutcomeRecord['outcome']
export type DoseDrawerOpener = { open: (outcome: Outcome) => void }

export function DoseActions({
  dose,
  medicine,
  refresh,
  onRecorded,
  appearance = 'button',
  opener,
  todayDate,
  referenceNow,
  describedBy,
}: {
  dose: DoseOccurrence
  medicine: Medicine
  refresh: () => Promise<boolean>
  onRecorded: (record: DoseOutcomeRecord) => void
  appearance?: 'row' | 'button'
  opener?: Ref<DoseDrawerOpener>
  todayDate?: string
  referenceNow?: string
  describedBy?: string
}) {
  const [editor, setEditor] = useState<Outcome | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [correcting, setCorrecting] = useState(false)
  const [editingDose, setEditingDose] = useState<DoseOccurrence | null>(null)
  const [needsReview, setNeedsReview] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const locked = useRef(false)
  const rowTrigger = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const retryAction = useRef<{ fingerprint: string; id: string } | null>(null)
  const pinnedCorrection = useRef<{ outcome: 'Taken' | 'Skipped'; revision: number } | null>(null)
  const [openedWithoutOutcome, setOpenedWithoutOutcome] = useState(false)

  function edit(outcome: Outcome | null) {
    setEditor(outcome)
    setError('')
    setNeedsReview(false)
  }

  function closeAfterConflict(message: string) {
    retryAction.current = null
    pinnedCorrection.current = null
    setCorrecting(false)
    setEditingDose(null)
    setEditor(null)
    setDrawerOpen(false)
    setOpenedWithoutOutcome(false)
    setError(message)
    setNeedsReview(true)
    requestAnimationFrame(() => rowTrigger.current?.focus())
  }

  async function submit(outcome: Outcome, details: Record<string, unknown>) {
    if (locked.current) return
    locked.current = true
    setSaving(true)
    setError('')
    const retry =
      outcome === 'Taken'
        ? 'Save could not be confirmed. Connect and retry with the same details.'
        : 'Save could not be confirmed. Retry with the same scheduled dose or refresh Today.'
    try {
      const correctingExisting =
        pinnedCorrection.current !== null && (dose.status === 'Taken' || dose.status === 'Skipped')
      const currentRevision = pinnedCorrection.current?.revision ?? 0
      const expectedOutcome = pinnedCorrection.current?.outcome ?? outcome
      const fingerprint = JSON.stringify({
        outcome,
        details,
        dose: dose.id,
        revision: currentRevision,
      })
      if (!retryAction.current || retryAction.current.fingerprint !== fingerprint)
        retryAction.current = { fingerprint, id: crypto.randomUUID() }
      const payload = correctingExisting
        ? {
            ...details,
            actionId: retryAction.current.id,
            expectedRevision: currentRevision,
            expectedOutcome,
            outcome,
            scheduleId: dose.scheduleId,
            dueAt: dose.dueAt,
          }
        : { ...details, outcome, scheduleId: dose.scheduleId, dueAt: dose.dueAt }
      const response = await fetch('/api/schedules', {
        method: correctingExisting ? 'PATCH' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify(payload),
      })
      if (response.status === 400) {
        setError(
          outcome === 'Taken'
            ? 'Check the quantity and enter a time that has already passed.'
            : 'This scheduled dose can no longer be skipped. Refresh Today to check its status.',
        )
      } else if (response.status === 401) {
        setError('Your session ended. Sign in again to record this dose.')
      } else if (response.status === 409) {
        if (correctingExisting) {
          await refresh()
          closeAfterConflict(
            'This dose changed elsewhere. Your correction was not saved. Review its current outcome before correcting it again.',
          )
        } else {
          const reconciled = await refresh()
          closeAfterConflict(
            reconciled
              ? 'This dose was already recorded. The current outcome is shown.'
              : 'An outcome already exists for this dose. Refresh Today to review it.',
          )
        }
      } else if (response.ok) {
        const body = await response.json()
        const record = parseDoseOutcomeRecord(body.record)
        if (
          record.outcome !== outcome ||
          record.scheduleId !== dose.scheduleId ||
          record.dueAt !== dose.dueAt ||
          (correctingExisting &&
            (record.revision !== currentRevision + 1 ||
              record.actionId !== retryAction.current.id ||
              (outcome === 'Taken' &&
                (record.outcome !== 'Taken' ||
                  record.takenAt !== details.takenAt ||
                  record.quantity !== details.quantity))))
        )
          throw new Error('acknowledgment')
        onRecorded(record)
        retryAction.current = null
        setCorrecting(false)
        setEditingDose(null)
        pinnedCorrection.current = null
        setEditor(null)
        setDrawerOpen(false)
        setOpenedWithoutOutcome(false)
        requestAnimationFrame(() => rowTrigger.current?.focus())
      } else {
        setError(retry)
      }
    } catch {
      setError(retry)
    } finally {
      locked.current = false
      setSaving(false)
    }
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
      pinnedCorrection.current = null
    }
  }

  useImperativeHandle(opener, () => ({
    open(outcome: Outcome) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setError('')
      setNeedsReview(false)
      setDrawerOpen(true)
      choose(outcome)
    },
  }))

  const verb = recorded ? 'Review' : 'Record'
  const triggerLabel = `${verb} dose for ${medicine.label} scheduled at ${doseClock(dose.dueAt)}`
  const sameDay = istanbulDate(new Date(dose.dueAt)) === todayDate
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
            setError('')
            setNeedsReview(false)
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
            setError('')
            setNeedsReview(false)
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
                  setNeedsReview(false)
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
        <Item variant="muted" size="sm" className="rounded-md bg-muted px-3.5 py-3">
          <ItemMedia className="text-muted-foreground">
            <Icon name="clock" size={18} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-body-sm font-bold text-muted-foreground">
              Scheduled
            </ItemTitle>
          </ItemContent>
          <ItemActions className="text-body-sm font-extrabold">
            <time dateTime={dose.dueAt}>
              {doseClock(dose.dueAt)}{' '}
              {sameDay ? 'today' : `on ${istanbulDate(new Date(dose.dueAt))}`}
            </time>
          </ItemActions>
        </Item>
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
                    ` on ${istanbulDate(new Date(dose.record.takenAt))}`}
                </>
              ) : (
                'Skipped. No intake recorded.'
              )}
            </p>
            <div className="flex flex-wrap gap-2.5">
              {(dose.status === 'Taken' || editingDose !== null) &&
                (editingDose ?? dose).status === 'Taken' && (
                  <TakenForm
                    dose={editingDose ?? dose}
                    medicine={medicine}
                    open={editingDose !== null}
                    saving={saving}
                    error={editingDose ? error : ''}
                    editing
                    onOpen={(open) => {
                      setError('')
                      if (open && dose.status === 'Taken') {
                        setEditingDose(dose)
                        pinnedCorrection.current = {
                          outcome: 'Taken',
                          revision: dose.record.revision ?? 0,
                        }
                      }
                      if (!open) {
                        retryAction.current = null
                        pinnedCorrection.current = null
                        setEditingDose(null)
                        setDrawerOpen(false)
                      }
                    }}
                    onSubmit={(details) => void submit('Taken', details)}
                  />
                )}
              {editingDose === null && (
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`Correct outcome for ${medicine.label} at ${doseClock(dose.dueAt)}`}
                  onClick={() => {
                    pinnedCorrection.current = {
                      outcome: dose.status,
                      revision: dose.record.revision ?? 0,
                    }
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
            error={editor === 'Taken' ? error : ''}
            referenceNow={referenceNow}
            onOpen={closeEditor}
            onSubmit={(details) => void submit('Taken', details)}
          />
        )}
        {(!recorded || correcting || editor === 'Skipped') && (
          <SkippedForm
            dose={dose}
            medicine={medicine}
            open={editor === 'Skipped'}
            saving={saving}
            error={editor === 'Skipped' ? error : ''}
            onOpen={closeEditor}
            onSubmit={() => void submit('Skipped', {})}
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
