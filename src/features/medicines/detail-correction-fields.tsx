'use client'

import { ChevronsUpDownIcon, LockIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Controller, useWatch, type Control } from 'react-hook-form'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  medicineTypeLabel,
  medicineTypeOptions,
  strengthHelp,
  unitName,
} from '@/lib/quantity-policy'
import { TypeTile } from './type-tile'
import type { MedicineDetails, MedicineDetailsValues } from './medicine-form-schema'
import type { MedicineRecord } from './contract'

type RecordValues = MedicineDetailsValues & { expectedRevision: number; date: string; time: string }
type RecordOutput = MedicineDetails & { expectedRevision: number; date: string; time: string }

// Inset rows from Add medication: a 92px label column, 56px minimum height, the ring on the row.
const textRow =
  'grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-0 px-4 not-first:border-t has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring'
const rowInput =
  'h-auto min-h-14 rounded-none border-0 bg-transparent px-0 text-body-lg font-bold placeholder:font-semibold focus-visible:outline-none aria-invalid:ring-0'
const rowHelp = 'col-span-full pb-3 text-caption'
const rowLabel = 'text-base font-extrabold text-foreground'
const valueRow = 'grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)_1.375rem] items-center'

/** A fact the user can read but not change here: label, muted value, optional lock. */
function ValueRow({ label, value, locked }: { label: string; value: string; locked: boolean }) {
  return (
    <div className="px-4 not-first:border-t">
      <div className={valueRow}>
        <span className={rowLabel}>{label}</span>
        <span className="text-body-lg font-bold text-muted-foreground">{value}</span>
        {locked && (
          <LockIcon
            aria-label="Can’t change"
            className="size-4.5 justify-self-center text-muted-foreground"
          />
        )}
      </div>
    </div>
  )
}

/** One inset group: a sentence-case label over a white card, an optional note under it. */
function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const id = useId()
  return (
    <FieldSet className="gap-2" aria-describedby={note ? `${id}-note` : undefined}>
      <FieldLegend className="mb-2.5 px-1 leading-snug font-extrabold text-muted-foreground data-[variant=legend]:text-body-sm">
        {title}
      </FieldLegend>
      <Card className="gap-0 py-0">
        <FieldGroup className="gap-0">{children}</FieldGroup>
      </Card>
      {note && (
        <p id={`${id}-note`} className="px-1 text-caption text-muted-foreground">
          {note}
        </p>
      )}
    </FieldSet>
  )
}

/** Detail correction keeps editable facts first; used Types remain locked to their saved unit. */
export function DetailCorrectionFields({
  control,
  period,
  locked,
  disabled,
}: {
  control: Control<RecordValues, unknown, RecordOutput>
  period: MedicineRecord['strengthRevisions'][number]
  locked: boolean
  disabled: boolean
}) {
  const id = useId()
  const selected = useWatch({ control, name: 'unit' })
  const type = locked ? period.unit : selected
  return (
    <>
      <Group title="Name and strength">
        <Controller
          name="label"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className={textRow}>
              <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
              <Input
                {...field}
                id={`${id}-name`}
                autoComplete="off"
                className={rowInput}
                aria-invalid={fieldState.invalid}
                aria-describedby={fieldState.invalid ? `${id}-name-error` : undefined}
              />
              <FieldError
                id={`${id}-name-error`}
                className="col-span-full pb-3 font-extrabold"
                errors={[fieldState.error]}
              />
            </Field>
          )}
        />
        <Controller
          name="strength"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className={textRow}>
              <FieldLabel htmlFor={`${id}-strength`}>Strength</FieldLabel>
              <Input
                {...field}
                id={`${id}-strength`}
                placeholder="Optional"
                autoComplete="off"
                className={rowInput}
                aria-invalid={fieldState.invalid}
                aria-describedby={`${fieldState.invalid ? `${id}-strength-error ` : ''}${id}-strength-help`}
              />
              <FieldError
                id={`${id}-strength-error`}
                className="col-span-full pb-3 font-extrabold"
                errors={[fieldState.error]}
              />
              <FieldDescription id={`${id}-strength-help`} className={rowHelp}>
                {strengthHelp(type || null)}
              </FieldDescription>
            </Field>
          )}
        />
      </Group>
      <Group
        title="Type and dose unit"
        note={
          locked
            ? 'Type and dose unit can’t change after a schedule or dose is added.'
            : 'Type can change until a schedule or dose is added.'
        }
      >
        {locked ? (
          <ValueRow label="Type" value={medicineTypeLabel(period.unit)} locked />
        ) : (
          <Controller
            name="unit"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="not-first:border-t">
                <Select
                  items={medicineTypeOptions}
                  value={field.value || null}
                  onValueChange={(value) => field.onChange(value ?? '')}
                  disabled={disabled}
                >
                  <SelectTrigger
                    ref={field.ref}
                    onBlur={field.onBlur}
                    icon={ChevronsUpDownIcon}
                    aria-labelledby={`${id}-type-label`}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.invalid ? `${id}-unit-error` : undefined}
                    className='grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)_1.375rem] gap-0 rounded-none border-0 bg-transparent px-4 text-body-lg focus-visible:-outline-offset-2 aria-invalid:ring-0 [&_svg:not([class*="size-"])]:size-5.5'
                  >
                    <span id={`${id}-type-label`} className={rowLabel}>
                      Type
                    </span>
                    <SelectValue
                      placeholder="Choose"
                      className="font-bold in-data-placeholder:font-semibold"
                    />
                  </SelectTrigger>
                  <SelectContent side="top" align="end" className="w-61 rounded-lg p-0.5">
                    {medicineTypeOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="min-h-12 pl-1.5 font-extrabold"
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
                  id={`${id}-unit-error`}
                  className="px-4 pb-3 font-extrabold"
                  errors={[fieldState.error]}
                />
              </Field>
            )}
          />
        )}
        <ValueRow label="Dose unit" value={type ? unitName(1, type) : ''} locked={locked} />
      </Group>
    </>
  )
}
