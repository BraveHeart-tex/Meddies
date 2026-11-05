'use client'

import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import type { DoseOccurrence } from './contract'
import { doseClock } from './taken-form'

// Explicit skip confirmation. A skip records no intake time or quantity.
export function SkippedForm({
  dose,
  medicine,
  open,
  saving,
  error,
  onOpen,
  onSubmit,
  refresh,
}: {
  dose: DoseOccurrence
  medicine: Medicine
  open: boolean
  saving: boolean
  error: string
  onOpen: (open: boolean) => void
  onSubmit: () => void
  refresh: () => Promise<boolean>
}) {
  const id = useId()
  const cancel = useRef<HTMLButtonElement>(null)

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
      aria-describedby={error ? `${id}-error` : undefined}
      className="flex min-w-0 flex-col gap-4.5"
    >
      <legend className="sr-only">Confirm skipped dose</legend>
      <div
        role="group"
        aria-label={`Confirm skipping ${medicine.label}`}
        className="flex flex-col gap-4.5"
      >
        <p className="text-center text-body-sm text-muted-foreground [overflow-wrap:anywhere]">
          Skip {medicine.label}, scheduled for {doseClock(dose.dueAt)} Istanbul time? No intake is
          recorded.
        </p>
        {error && (
          <Alert id={`${id}-error`} variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            size="sheet"
            className="w-full whitespace-normal"
            disabled={saving}
            onClick={onSubmit}
          >
            {saving ? 'Saving skip...' : 'Save as skipped'}
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
          {error && (
            <Button type="button" variant="outline" onClick={() => void refresh()}>
              Refresh Today
            </Button>
          )}
        </div>
      </div>
    </fieldset>
  )
}
