'use client'

import { medicineTypeOptions, strengthHelp, unitName } from '@/lib/quantity-policy'

import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import type { CatalogMatch } from '@/features/catalog-products/contract'
import { MedicineScan } from './medicine-scan'
import { TypeTile } from './type-tile'
import type { Medicine } from './contract'
import { saveMessages } from '@/lib/save-messages'
import type { SaveProblem } from '@/lib/session-saves'
import { useMedicineSave } from './use-medicine-save'
import {
  medicineAddKey,
  medicineFormDefaults,
  medicineFormSchema,
  type MedicineFormOutput,
  type MedicineFormValues,
} from './medicine-form-schema'

const UNITS = medicineTypeOptions

// Inset rows from `B·Drawer`: a 92px label column, 56px minimum height, the focus ring on the row.
const textRow =
  'grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-0 px-4 not-first:border-t first:rounded-t-2xl has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring'
const rowInput =
  'h-auto min-h-14 rounded-none border-0 bg-transparent px-0 text-body-lg font-bold placeholder:font-semibold focus-visible:outline-none disabled:bg-transparent aria-invalid:ring-0'
const rowError = 'col-span-full pb-3 font-extrabold'
const rowHelp = 'col-span-full pb-3 text-caption'

/** Stock help for the chosen Type's plural, or without a unit while none is chosen. */
const stockHelp = (plural: string | null) =>
  `How many ${plural ? `${plural} ` : ''}you have now. Leave empty to skip tracking.`

/**
 * Add medicine form: the production reference for React Hook Form (docs/forms.md).
 * Editing values are kept as session drafts; `onSaved` runs only after the server confirms.
 * A scan match fills Name, Type and Strength as editable values and saves nothing.
 */
export function MedicineForm({ onSaved }: { onSaved: (medicine: Medicine) => void }) {
  const form = useForm<MedicineFormValues, unknown, MedicineFormOutput>({
    resolver: zodResolver(medicineFormSchema),
    defaultValues: medicineFormDefaults,
  })
  const draft = useSessionFormDraft(medicineAddKey, form)
  // Strength help and the Stock unit follow the chosen Type.
  const unit = useWatch({ control: form.control, name: 'unit' })
  const plural = unit ? unitName(null, unit) : null
  const offline = useKnownOffline()
  // Whether the details came from a scan, for `B·Barcode read`; a reset form starts unscanned.
  const [scanned, setScanned] = useState(false)
  const saveState = useMedicineSave((saved) => {
    form.reset(medicineFormDefaults)
    setScanned(false)
    draft.dismissRestoreNotice()
    onSaved(saved)
  })
  function fill(match: CatalogMatch) {
    // Names stay as the catalog holds them; an unknown value leaves its row for typing.
    const options = { shouldDirty: true, shouldValidate: form.formState.isSubmitted }
    form.setValue('label', match.name ?? '', options)
    form.setValue('unit', match.type ?? '', options)
    form.setValue('strength', match.strength ?? '', options)
    if (form.formState.isSubmitted) void form.trigger('stock')
    setScanned(true)
  }
  async function save(values: MedicineFormOutput) {
    await saveState.submit(values)
  }

  const isSubmitting = Boolean(saveState.pending)
  const problem = saveState.problem
  const problemLabel = saveState.label
  const locked = isSubmitting || problem === 'conflict'

  return (
    <form
      noValidate
      // Wrapped so building the handler during render never touches the save refs.
      onSubmit={(event) => void form.handleSubmit(save)(event)}
      aria-busy={isSubmitting}
      className="flex flex-col gap-3.5"
    >
      <MedicineScan read={scanned} disabled={locked || offline} onMatch={fill} />
      {draft.restored && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body-sm text-muted-foreground">{saveMessages.draftRestored}</p>
          <Button
            type="button"
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => {
              if (saveState.pending) return
              saveState.clear()
              form.reset(medicineFormDefaults)
              setScanned(false)
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
                  <FieldError
                    id="medicine-label-error"
                    className={rowError}
                    errors={[fieldState.error]}
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
                    onValueChange={(value) => {
                      field.onChange(value ?? '')
                      // The Stock count validates against the Type; recheck a shown error.
                      if (form.formState.isSubmitted) void form.trigger('stock')
                    }}
                    disabled={field.disabled || locked}
                  >
                    {/* The whole row is the trigger, its label included. */}
                    <SelectTrigger
                      ref={field.ref}
                      onBlur={field.onBlur}
                      icon={ChevronsUpDownIcon}
                      aria-labelledby="medicine-unit-label"
                      aria-describedby={fieldState.invalid ? 'medicine-unit-error' : undefined}
                      aria-invalid={fieldState.invalid}
                      className='grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)_1.375rem] gap-0 rounded-none border-0 bg-transparent px-4 text-body-lg focus-visible:-outline-offset-2 aria-invalid:ring-0 [&_svg:not([class*="size-"])]:size-5.5'
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
                      {UNITS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          className="min-h-12 pl-1.5 font-extrabold data-[selected]:bg-transparent data-[selected]:text-foreground data-[selected]:data-highlighted:bg-secondary"
                        >
                          <span className="flex items-center gap-2.5">
                            <TypeTile type={option.value} />
                            {option.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError
                    id="medicine-unit-error"
                    className="px-4 pb-3 font-extrabold"
                    errors={[fieldState.error]}
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
                    enterKeyHint="next"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid
                        ? 'medicine-strength-error medicine-strength-help'
                        : 'medicine-strength-help'
                    }
                    className={rowInput}
                  />
                  <FieldError
                    id="medicine-strength-error"
                    className={rowError}
                    errors={[fieldState.error]}
                  />
                  <FieldDescription id="medicine-strength-help" className={rowHelp}>
                    {strengthHelp(unit || null)}
                  </FieldDescription>
                </Field>
              )}
            />
            <Controller
              name="stock"
              control={form.control}
              render={({ field, fieldState }) => (
                // A plain count with the dose unit after it; empty keeps stock off (#394).
                <Field
                  data-invalid={fieldState.invalid}
                  className="grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)_auto] items-center gap-0 rounded-b-2xl px-4 not-first:border-t has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring"
                >
                  <FieldLabel htmlFor="medicine-stock">Stock</FieldLabel>
                  <Input
                    {...field}
                    id="medicine-stock"
                    placeholder="Optional"
                    inputMode="decimal"
                    autoComplete="off"
                    enterKeyHint="done"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={[
                      plural && 'medicine-stock-unit',
                      fieldState.invalid && 'medicine-stock-error',
                      'medicine-stock-help',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    className={rowInput}
                  />
                  {plural && (
                    <span id="medicine-stock-unit" className="pl-2 font-bold text-muted-foreground">
                      {plural}
                    </span>
                  )}
                  <FieldError
                    id="medicine-stock-error"
                    className={rowError}
                    errors={[fieldState.error]}
                  />
                  <FieldDescription id="medicine-stock-help" className={rowHelp}>
                    {stockHelp(plural)}
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
        </Card>
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
      body: saveMessages.retrySameSave,
    },
    rejected: {
      title: `${label} wasn't saved.`,
      body: "Meddies couldn't accept these details. Check the name and strength, then save again.",
    },
    conflict: {
      title: 'A different version of this medication is already saved.',
      body: 'Check it before adding this one again.',
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
          {"See what's saved"}
        </Link>
      )}
    </Alert>
  )
}
