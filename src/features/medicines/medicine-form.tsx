'use client'

import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useKnownOffline } from '@/lib/use-known-offline'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { parseMedicine, type Medicine } from './contract'
import { medicinesQuery } from './queries'
import {
  medicineFormDefaults,
  medicineFormSchema,
  type MedicineFormOutput,
  type MedicineFormValues,
} from './medicine-form-schema'

const UNITS = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
] as const

/** Request failures shown at form level. Types drive the alert, the primary label and locking. */
type SaveProblem = 'rejected' | 'unauthorized' | 'conflict' | 'uncertain'

/** Reconciling read: refreshes the cached list and finds the attempted medicine in it. */
async function findSavedMedicine(client: QueryClient, id: string) {
  try {
    const medicines = await client.fetchQuery({ ...medicinesQuery(), staleTime: 0 })
    return medicines.find((item) => item.id === id) ?? null
  } catch {
    return null
  }
}

/**
 * Add medicine form: the production reference for React Hook Form (docs/development.md#forms).
 * Form values stay local to this component; `onSaved` runs only after the server confirms.
 */
export function MedicineForm({ onSaved }: { onSaved: (medicine: Medicine) => void }) {
  const form = useForm<MedicineFormValues, unknown, MedicineFormOutput>({
    resolver: zodResolver(medicineFormSchema),
    defaultValues: medicineFormDefaults,
  })
  const offline = useKnownOffline()
  const queryClient = useQueryClient()
  // Retry identity: reused while the validated details are unchanged, so a retry after an
  // uncertain result saves at most one medicine.
  const action = useRef<{ id: string; fingerprint: string } | null>(null)
  // Synchronous duplicate-submit guard; RHF's isSubmitting updates only after a render.
  const lock = useRef(false)
  // Name in the failed save, for the alert copy; kept apart from the edited values.
  const [problemLabel, setProblemLabel] = useState('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function save(values: MedicineFormOutput) {
    if (lock.current) return
    lock.current = true
    try {
      const fingerprint = JSON.stringify([values.label, values.strength, values.unit])
      if (action.current?.fingerprint !== fingerprint)
        action.current = { id: crypto.randomUUID(), fingerprint }
      const { id } = action.current
      let saved: Medicine | null = null
      let problem: SaveProblem = 'uncertain'
      try {
        const response = await fetch('/api/medicines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...values }),
          signal: AbortSignal.timeout(12000),
        })
        if (response.ok) saved = parseMedicine((await response.json()).medicines[0])
        else if (response.status === 400) problem = 'rejected'
        else if (response.status === 401) problem = 'unauthorized'
        else if (response.status === 409) problem = 'conflict'
      } catch {}
      // Reconcile once before claiming the save is unconfirmed (647·M2).
      if (!saved && problem === 'uncertain') saved = await findSavedMedicine(queryClient, id)
      if (saved) {
        action.current = null
        if (mounted.current) form.reset(medicineFormDefaults)
        onSaved(saved)
        return
      }
      if (mounted.current) {
        setProblemLabel(values.label)
        form.setError('root.server', { type: problem })
      }
    } finally {
      lock.current = false
    }
  }

  const { isSubmitting, errors } = form.formState
  const problem = errors.root?.server?.type as SaveProblem | undefined
  const locked = isSubmitting || problem === 'conflict'

  return (
    <form
      noValidate
      // Wrapped so building the handler during render never touches the save refs.
      onSubmit={(event) => void form.handleSubmit(save)(event)}
      aria-busy={isSubmitting}
      className="flex flex-col gap-5"
    >
      <FieldSet disabled={locked} className="disabled:opacity-70">
        <FieldLegend className="sr-only">Medicine details</FieldLegend>
        <FieldGroup>
          <Controller
            name="label"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="medicine-label">Medicine name</FieldLabel>
                <Input
                  {...field}
                  id="medicine-label"
                  autoComplete="off"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid
                      ? 'medicine-label-error medicine-label-help'
                      : 'medicine-label-help'
                  }
                />
                <FieldError id="medicine-label-error" errors={[fieldState.error]} />
                <FieldDescription id="medicine-label-help">
                  Use the name on your pack.
                </FieldDescription>
              </Field>
            )}
          />
          <Controller
            name="strength"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="medicine-strength">
                  Product strength{' '}
                  <span className="font-semibold text-muted-foreground">(optional)</span>
                </FieldLabel>
                <Input
                  {...field}
                  id="medicine-strength"
                  autoComplete="off"
                  enterKeyHint="done"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid
                      ? 'medicine-strength-error medicine-strength-help'
                      : 'medicine-strength-help'
                  }
                />
                <FieldError id="medicine-strength-error" errors={[fieldState.error]} />
                <FieldDescription id="medicine-strength-help">
                  Printed on the pack, like 200 mg or 1000 IU. Not how much you take.
                </FieldDescription>
              </Field>
            )}
          />
          <Controller
            name="unit"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldTitle id="medicine-unit-label">Unit</FieldTitle>
                <ToggleGroup
                  variant="outline"
                  className="grid w-full grid-cols-2"
                  aria-labelledby="medicine-unit-label"
                  aria-describedby={
                    fieldState.invalid
                      ? 'medicine-unit-error medicine-unit-help'
                      : 'medicine-unit-help'
                  }
                  aria-invalid={fieldState.invalid}
                  value={field.value ? [field.value] : []}
                  onValueChange={(value) => field.onChange(value[0] ?? '')}
                  onBlur={field.onBlur}
                  disabled={field.disabled || locked}
                >
                  {UNITS.map((unit, index) => (
                    <ToggleGroupItem
                      key={unit.value}
                      value={unit.value}
                      // RHF focuses the first option when unit is the first invalid field.
                      ref={index === 0 ? field.ref : undefined}
                      aria-invalid={fieldState.invalid}
                    >
                      {unit.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldError id="medicine-unit-error" errors={[fieldState.error]} />
                {/* The toggle group is data-horizontal; keep normal wrapping, not the horizontal-field balance. */}
                <FieldDescription
                  id="medicine-unit-help"
                  className="group-has-data-horizontal/field:text-pretty"
                >
                  How you take it. Schedules use whole or half tablets, or whole capsules.
                </FieldDescription>
              </Field>
            )}
          />
        </FieldGroup>
      </FieldSet>
      {offline && !isSubmitting && problem !== 'conflict' ? (
        <Alert id="medicine-save-problem">
          <InfoIcon aria-hidden="true" />
          <AlertTitle>You&apos;re offline.</AlertTitle>
          <AlertDescription>Your details stay here until you leave this page.</AlertDescription>
        </Alert>
      ) : problem ? (
        <SaveProblemAlert problem={problem} label={problemLabel} />
      ) : null}
      {problem !== 'conflict' && (
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting || offline}
          className="w-full whitespace-normal"
          aria-describedby={problem || offline ? 'medicine-save-problem' : undefined}
        >
          {isSubmitting
            ? 'Saving medicine...'
            : offline
              ? 'Connect to save'
              : problem === 'uncertain'
                ? 'Retry saving medicine'
                : 'Save medicine'}
        </Button>
      )}
    </form>
  )
}

function SaveProblemAlert({ problem, label }: { problem: SaveProblem; label: string }) {
  const copy = {
    uncertain: {
      title: 'Save could not be confirmed.',
      body: `Your details are still here. Retry saves ${label} once, even if the first try arrived. If you change the details, check Medications first so it isn't saved twice.`,
    },
    rejected: {
      title: `${label} wasn't saved.`,
      body: "Meddies couldn't accept these details. Check the name and strength, then save again.",
    },
    unauthorized: {
      title: 'Your session ended.',
      body: `${label} wasn't saved. Sign in again to save your medicine.`,
    },
    conflict: {
      title: 'A different version of this save is already recorded.',
      body: 'Open Medications to see what was saved before adding it again.',
    },
  }[problem]
  return (
    <Alert id="medicine-save-problem" variant="destructive">
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{copy.body}</AlertDescription>
      {problem === 'conflict' && (
        <Link
          href="/medications"
          className={buttonVariants({ variant: 'outline', className: 'mt-2 justify-self-start' })}
        >
          Open Medications
        </Link>
      )}
    </Alert>
  )
}
