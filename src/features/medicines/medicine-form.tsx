'use client'

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
import { useSessionFormDraft } from '@/lib/use-session-form-draft'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { parseMedicine, type Medicine } from './contract'
import { medicinesQuery, confirmMedicine } from './queries'
import { saveMessages } from '@/lib/save-messages'
import { requestSave, type SaveProblem } from '@/lib/session-saves'
import { useSessionSave } from '@/lib/use-session-save'
import { discardSessionFormDraft } from '@/lib/use-session-form-draft'
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
 * Add medicine form: the production reference for React Hook Form (docs/forms.md).
 * Editing values are kept as session drafts; `onSaved` runs only after the server confirms.
 */
export function MedicineForm({ onSaved }: { onSaved: (medicine: Medicine) => void }) {
  const form = useForm<MedicineFormValues, unknown, MedicineFormOutput>({
    resolver: zodResolver(medicineFormSchema),
    defaultValues: medicineFormDefaults,
  })
  const draft = useSessionFormDraft('medicine:add', form)
  const offline = useKnownOffline()
  const queryClient = useQueryClient()
  const saveState = useSessionSave<Medicine>('medicine:add', (saved) => {
    form.reset(medicineFormDefaults)
    draft.discard()
    onSaved(saved)
  })
  async function save(values: MedicineFormOutput) {
    await saveState.store.submit(
      'medicine:add',
      {
        payload: { ...values },
        label: values.label,
        kind: 'medicine',
        href: '/medications?add',
      },
      async (payload, active) => {
        let result = await requestSave('/api/medicines', payload, (data) =>
          parseMedicine((data as { medicines: unknown[] }).medicines[0]),
        )
        if (result.problem === 'unconfirmed' && active()) {
          const saved = await findSavedMedicine(queryClient, payload.id as string)
          if (saved) result = { saved }
        }
        if (result.saved && active()) {
          discardSessionFormDraft(queryClient, 'medicine:add')
          await confirmMedicine(queryClient, result.saved, active)
        }
        return result
      },
    )
  }

  const isSubmitting = Boolean(saveState.pending)
  const problem = saveState.problem
  const problemLabel = saveState.attempt?.label ?? ''
  const locked = isSubmitting || problem === 'conflict'

  return (
    <form
      noValidate
      // Wrapped so building the handler during render never touches the save refs.
      onSubmit={(event) => void form.handleSubmit(save)(event)}
      aria-busy={isSubmitting}
      className="flex flex-col gap-5"
    >
      {draft.restored && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body-sm text-muted-foreground">{saveMessages.draftRestored}</p>
          <Button
            type="button"
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => {
              if (saveState.pending) return
              saveState.store.clear('medicine:add')
              form.reset(medicineFormDefaults)
              draft.discard()
            }}
          >
            Clear form
          </Button>
        </div>
      )}
      <FieldSet disabled={locked} className="disabled:opacity-70">
        <FieldLegend className="sr-only">Medication details</FieldLegend>
        <FieldGroup>
          <Controller
            name="label"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="medicine-label">Medication name</FieldLabel>
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
                  Strength <span className="font-semibold text-muted-foreground">(optional)</span>
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
          <AlertTitle>{saveMessages.offline}</AlertTitle>
          <AlertDescription>{saveMessages.offlineFormDetails}</AlertDescription>
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
            ? 'Saving medication...'
            : offline
              ? saveMessages.connectToSave
              : problem === 'unconfirmed'
                ? 'Try saving medication again'
                : 'Save medication'}
        </Button>
      )}
    </form>
  )
}

function SaveProblemAlert({ problem, label }: { problem: SaveProblem; label: string }) {
  const copy = {
    unconfirmed: {
      title: saveMessages.mightNotHaveSaved,
      body: `Your details are still here. Trying again saves ${label} only once, even if the first try went through. If you change anything, check Medications first so it doesn't save twice.`,
    },
    rejected: {
      title: `${label} wasn't saved.`,
      body: "Meddies couldn't accept these details. Check the name and strength, then save again.",
    },
    unauthorized: {
      title: saveMessages.sessionEnded,
      body: `${label} wasn't saved. Sign in again to save your medication.`,
    },
    conflict: {
      title: 'A different version of this medication is already saved.',
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
