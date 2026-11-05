'use client'

import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import type { DoseOccurrence } from './contract'
import { doseClock } from './taken-form'

export function SkippedForm({
  dose,
  medicine,
  open,
  blocked,
  saving,
  error,
  onOpen,
  onSubmit,
  refresh,
}: {
  dose: DoseOccurrence
  medicine: Medicine
  open: boolean
  blocked: boolean
  saving: boolean
  error: string
  onOpen: (open: boolean) => void
  onSubmit: () => void
  refresh: () => Promise<boolean>
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) cancel.current?.focus()
  }, [open])

  function close() {
    onOpen(false)
    trigger.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFieldSetElement>) {
    if (event.key === 'Escape' && !saving) {
      event.preventDefault()
      close()
    }
  }

  return (
    <div>
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        className="min-h-11"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Mark ${medicine.label} at ${doseClock(dose.dueAt)} as skipped`}
        disabled={saving || blocked}
        onClick={() => onOpen(true)}
      >
        Mark as skipped
      </Button>
      <fieldset
        id={id}
        hidden={!open}
        disabled={saving}
        onKeyDown={handleKeyDown}
        aria-describedby={error ? `${id}-error` : undefined}
        className="space-y-3 pt-3"
      >
        <legend className="sr-only">Confirm skipped dose</legend>
        <div role="group" aria-label={`Confirm skipping ${medicine.label}`} className="space-y-2">
          <p>
            Skip {medicine.label}, scheduled for {doseClock(dose.dueAt)} Istanbul time?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" disabled={saving} onClick={onSubmit}>
              {saving ? 'Saving skip...' : 'Confirm skipped'}
            </Button>
            <Button
              ref={cancel}
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={close}
            >
              Cancel
            </Button>
            {error && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => void refresh()}
              >
                Refresh Today
              </Button>
            )}
          </div>
        </div>
        {error && (
          <p id={`${id}-error`} role="alert">
            {error}
          </p>
        )}
      </fieldset>
    </div>
  )
}
