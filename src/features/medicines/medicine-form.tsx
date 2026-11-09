'use client'

import { medicationsHref } from './routes'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ChevronsUpDownIcon, InfoIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useKnownOffline } from '@/lib/use-known-offline'
import { useSessionFormDraft } from '@/lib/use-session-form-draft'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MedicationUnitTile } from './medication-tile'
import { parseMedicine, type Medicine } from './contract'
import { medicinesQuery, confirmMedicine } from './queries'
import { saveMessages } from '@/lib/save-messages'
import { requestSave, type SaveProblem } from '@/lib/session-saves'
import { useSessionSave } from '@/lib/use-session-save'
import { discardSessionFormDraft } from '@/lib/session-drafts'
import {
  medicineAddKey,
  medicineFormDefaults,
  medicineFormSchema,
  type MedicineFormOutput,
  type MedicineFormValues,
} from './medicine-form-schema'

const UNITS = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
] as const

// Inset rows from `B·Drawer`: a 92px label column, 56px minimum height, the focus ring on the row.
const textRow =
  'grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-0 px-4 not-first:border-t first:rounded-t-2xl has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring'
const rowInput =
  'h-auto min-h-14 rounded-none border-0 bg-transparent px-0 text-body-lg font-bold placeholder:font-semibold focus-visible:outline-none disabled:bg-transparent aria-invalid:ring-0'
const underGroup = 'px-1 font-extrabold'
const rowHelp = 'px-1 text-caption nth-last-2:mt-0'

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
  const draft = useSessionFormDraft(medicineAddKey, form)
  const offline = useKnownOffline()
  const queryClient = useQueryClient()
  const saveState = useSessionSave<Medicine>(medicineAddKey, (saved) => {
    form.reset(medicineFormDefaults)
    draft.discard()
    onSaved(saved)
  })
  async function save(values: MedicineFormOutput) {
    await saveState.store.submit(
      medicineAddKey,
      {
        payload: { ...values },
        label: values.label,
        kind: 'medicine',
        href: medicationsHref({ mode: 'add' }),
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
          discardSessionFormDraft(queryClient, medicineAddKey)
          await confirmMedicine(queryClient, result.saved, active)
        }
        return result
      },
    )
  }

  const { errors } = form.formState
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
      className="flex flex-col gap-3.5"
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
              saveState.store.clear(medicineAddKey)
              form.reset(medicineFormDefaults)
              draft.discard()
            }}
          >
            Clear form
          </Button>
        </div>
      )}
      <FieldSet disabled={locked} className="gap-2 disabled:opacity-70">
        <FieldLegend className="sr-only">Medication details</FieldLegend>
        <Card className="gap-0 py-0">
          <FieldGroup className="gap-0">
            <Controller
              name="label"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className={textRow}>
                  <FieldLabel htmlFor="medicine-label">Name</FieldLabel>
                  <Input
                    {...field}
                    id="medicine-label"
                    placeholder="On your pack"
                    autoComplete="off"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.invalid ? 'medicine-label-error' : undefined}
                    className={rowInput}
                  />
                </Field>
              )}
            />
            <Controller
              name="strength"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className={textRow}>
                  <FieldLabel htmlFor="medicine-strength">Strength</FieldLabel>
                  <Input
                    {...field}
                    id="medicine-strength"
                    placeholder="Optional"
                    autoComplete="off"
                    enterKeyHint="done"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid
                        ? 'medicine-strength-error medicine-strength-help'
                        : 'medicine-strength-help'
                    }
                    className={rowInput}
                  />
                </Field>
              )}
            />
            <Controller
              name="unit"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="not-first:border-t">
                  <Select
                    items={UNITS}
                    value={field.value || null}
                    onValueChange={(value) => field.onChange(value ?? '')}
                    disabled={field.disabled || locked}
                  >
                    {/* The whole row is the trigger, its label included. */}
                    <SelectTrigger
                      ref={field.ref}
                      onBlur={field.onBlur}
                      icon={ChevronsUpDownIcon}
                      aria-labelledby="medicine-unit-label"
                      aria-describedby={
                        fieldState.invalid
                          ? 'medicine-unit-error medicine-unit-help'
                          : 'medicine-unit-help'
                      }
                      aria-invalid={fieldState.invalid}
                      className='grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)_1.375rem] gap-0 rounded-none rounded-b-2xl border-0 bg-transparent px-4 text-body-lg focus-visible:-outline-offset-2 aria-invalid:ring-0 [&_svg:not([class*="size-"])]:size-5.5'
                    >
                      <span
                        id="medicine-unit-label"
                        className="text-base font-extrabold text-foreground group-data-[invalid=true]/field:text-destructive"
                      >
                        Type
                      </span>
                      <SelectValue
                        placeholder="Choose"
                        className="font-bold in-data-placeholder:font-semibold"
                      />
                    </SelectTrigger>
                    {/* Opens above the row, so it never hides Save medication. */}
                    <SelectContent side="top" align="end" className="w-61 rounded-lg p-0.5">
                      {UNITS.map((unit) => (
                        <SelectItem
                          key={unit.value}
                          value={unit.value}
                          className="min-h-12 pl-1.5 font-extrabold data-[selected]:bg-transparent data-[selected]:text-foreground data-[selected]:data-highlighted:bg-secondary"
                        >
                          <span className="flex items-center gap-2.5">
                            <MedicationUnitTile unit={unit.value} />
                            {unit.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          </FieldGroup>
        </Card>
        <FieldError id="medicine-label-error" className={underGroup} errors={[errors.label]} />
        <FieldError
          id="medicine-strength-error"
          className={underGroup}
          errors={[errors.strength]}
        />
        <FieldError id="medicine-unit-error" className={underGroup} errors={[errors.unit]} />
        <FieldDescription id="medicine-strength-help" className={rowHelp}>
          Strength is printed on the pack, like 200 mg or 1000 IU. Not how much you take.
        </FieldDescription>
        <FieldDescription id="medicine-unit-help" className={rowHelp}>
          Schedules use whole or half tablets, or whole capsules.
        </FieldDescription>
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
          size="drawer"
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
