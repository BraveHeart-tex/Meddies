'use client'

import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatTime } from '@/lib/calendar-date'
import { useKnownOffline } from '@/lib/use-known-offline'
import type { Medicine } from '@/features/medicines/contract'
import { saveMessages } from '@/lib/save-messages'
import type { DoseOccurrence } from './contract'
import { DoseSaveProblem } from './dose-save-problem'
import type { SaveProblem } from './dose-saves'

// Explicit skip confirmation (108·R4). A skip records no intake time or quantity.
export function SkippedForm({
  dose,
  medicine,
  open,
  saving,
  reviewRequired = false,
  problem,
  onOpen,
  onSubmit,
  refresh,
}: {
  dose: DoseOccurrence
  medicine: Medicine
  open: boolean
  saving: boolean
  reviewRequired?: boolean
  problem: SaveProblem | null
  onOpen: (open: boolean) => void
  onSubmit: () => void
  refresh: () => Promise<boolean>
}) {
  const id = useId()
  const cancel = useRef<HTMLButtonElement>(null)
  const offline = useKnownOffline()

  useEffect(() => {
    if (open) cancel.current?.focus()
  }, [open])

  function handleKeyDown(event: KeyboardEvent<HTMLFieldSetElement>) {
    if (event.key === 'Escape' && !saving) {
      event.preventDefault()
      onOpen(false)
    }
  }

  return (
    <fieldset
      id={id}
      hidden={!open}
      disabled={saving}
      onKeyDown={handleKeyDown}
      aria-describedby={!saving && (problem || offline) ? `${id}-problem` : undefined}
      className="flex min-w-0 flex-col gap-4.5"
    >
      <legend className="sr-only">Skip this dose</legend>
      <div role="group" aria-label={`Skip ${medicine.label}`} className="flex flex-col gap-4.5">
        <Alert className="[overflow-wrap:anywhere]">
          <InfoIcon aria-hidden="true" />
          <AlertDescription>
            Skip {medicine.label}, scheduled for {formatTime(dose.dueAt)}? No time or amount is
            saved.
          </AlertDescription>
        </Alert>
        {!saving && (
          <DoseSaveProblem
            id={`${id}-problem`}
            outcome="Skipped"
            problem={problem}
            offline={offline}
          />
        )}
        {/* A swipe that starts on a control never closes the drawer (108·D14). */}
        <div data-base-ui-swipe-ignore="y" className="flex flex-col gap-1.5">
          <Button
            type="button"
            size="drawer"
            className="w-full whitespace-normal"
            disabled={saving || offline || reviewRequired}
            onClick={onSubmit}
          >
            {saving
              ? 'Saving...'
              : offline
                ? saveMessages.connectToSave
                : problem?.kind === 'uncertain'
                  ? 'Try saving as skipped again'
                  : 'Save as skipped'}
          </Button>
          <Button
            ref={cancel}
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => onOpen(false)}
          >
            Cancel
          </Button>
          {problem?.kind === 'rejected' && (
            <Button type="button" variant="outline" onClick={() => void refresh()}>
              Refresh Today
            </Button>
          )}
        </div>
      </div>
    </fieldset>
  )
}
