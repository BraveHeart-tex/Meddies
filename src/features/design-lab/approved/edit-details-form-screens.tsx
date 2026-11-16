'use client'

/**
 * #347 approved Direction C: the Edit details form grouped by what can change. Name and strength
 * come first; Type and dose unit are their own group, a Type select while it can change and two
 * locked rows with the reason once the medication has a schedule or dose.
 */
import { ChevronsUpDownIcon, LockIcon } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
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
import type { MedicineRecord } from '@/features/medicines/contract'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { medicationRecordHref } from '@/features/medicines/routes'
import { TypeTile } from '@/features/medicines/type-tile'
import {
  medicineTypeLabel,
  medicineTypeOptions,
  strengthHelp,
  unitName,
  type MedicineType,
} from '@/lib/quantity-policy'
import { periodSentence } from './edit-details-form-model'

const NOTE = 'These changes also update doses recorded for this period.'
const LOCKED = 'Type and dose unit can’t change after a schedule or dose is added.'
const CHANGEABLE = 'Type can change until a schedule or dose is added.'

// Inset rows from Add medication: a 92px label column, 56px minimum height, the ring on the row.
const textRow =
  'grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-0 px-4 not-first:border-t has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring'
const rowInput =
  'h-auto min-h-14 rounded-none border-0 bg-transparent px-0 text-body-lg font-bold placeholder:font-semibold focus-visible:outline-none aria-invalid:ring-0'
const rowHelp = 'col-span-full pb-3 text-caption'
const rowLabel = 'text-base font-extrabold text-foreground'
const valueRow = 'grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)_1.375rem] items-center'

/** "tablet", "ml": the dose unit as a fact, never pluralized. */
const doseUnit = (type: MedicineType) => unitName(1, type)

function Screen({ medicine, children }: { medicine: MedicineRecord; children: ReactNode }) {
  return (
    <AppShell current="/medications">
      <ScreenStack>
        <div className="flex flex-col gap-5 [overflow-wrap:anywhere]">
          <MedicationBackRow href={medicationRecordHref(medicine.id)}>
            {medicine.label}
          </MedicationBackRow>
          <MedicationIdentity medicine={medicine} />
          {children}
        </div>
      </ScreenStack>
    </AppShell>
  )
}

function Actions() {
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="lg">
        Save details
      </Button>
      <Button type="button" variant="ghost">
        Cancel
      </Button>
    </div>
  )
}

/** The note and the period it means, read as one paragraph. */
function Consequence({ medicine }: { medicine: MedicineRecord }) {
  return (
    <p className="text-body-sm text-muted-foreground">
      {NOTE} {periodSentence(medicine, medicine.currentStrengthRevisionId)}
    </p>
  )
}

function useType(medicine: MedicineRecord) {
  return useState<MedicineType>(medicine.unit)
}

/** Add medication's whole-row Type trigger. */
function TypeRowSelect({
  value,
  onChange,
}: {
  value: MedicineType
  onChange: (value: MedicineType) => void
}) {
  const id = useId()
  return (
    <Field className="not-first:border-t">
      <Select
        items={medicineTypeOptions}
        value={value}
        onValueChange={(next) => next && onChange(next as MedicineType)}
      >
        <SelectTrigger
          icon={ChevronsUpDownIcon}
          aria-labelledby={`${id}-label`}
          className='grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)_1.375rem] gap-0 rounded-none border-0 bg-transparent px-4 text-body-lg focus-visible:-outline-offset-2 [&_svg:not([class*="size-"])]:size-5.5'
        >
          <span id={`${id}-label`} className={rowLabel}>
            Type
          </span>
          <SelectValue className="font-bold" />
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
    </Field>
  )
}

/** A fact the user can read but not change here: label, muted value, optional lock. */
function ValueRow({
  label,
  value,
  locked,
  help,
}: {
  label: string
  value: string
  locked: boolean
  help?: string
}) {
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
      {help && <p className="pb-3 text-caption text-muted-foreground">{help}</p>}
    </div>
  )
}

function NameRow({ medicine }: { medicine: MedicineRecord }) {
  const id = useId()
  return (
    <Field className={textRow}>
      <FieldLabel htmlFor={id}>Name</FieldLabel>
      <Input id={id} defaultValue={medicine.label} autoComplete="off" className={rowInput} />
    </Field>
  )
}

function StrengthRow({ medicine, type }: { medicine: MedicineRecord; type: MedicineType }) {
  const id = useId()
  return (
    <Field className={textRow}>
      <FieldLabel htmlFor={id}>Strength</FieldLabel>
      <Input
        id={id}
        defaultValue={medicine.strength ?? ''}
        placeholder="Optional"
        autoComplete="off"
        aria-describedby={`${id}-help`}
        className={rowInput}
      />
      <FieldDescription id={`${id}-help`} className={rowHelp}>
        {strengthHelp(type)}
      </FieldDescription>
    </Field>
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

/** 347·C1-C4: what can change, then Type and dose unit as their own group with the reason under it. */
export function GroupedForm({ medicine }: { medicine: MedicineRecord }) {
  const locked = medicine.everHadSchedule || medicine.everHadDose
  const [type, setType] = useType(medicine)
  return (
    <Screen medicine={medicine}>
      <div className="flex flex-col gap-2">
        <h2 className="text-heading">Edit details</h2>
        <Consequence medicine={medicine} />
      </div>
      <form noValidate className="flex flex-col gap-5 pb-5">
        <Group title="Name and strength">
          <NameRow medicine={medicine} />
          <StrengthRow medicine={medicine} type={type} />
        </Group>
        <Group title="Type and dose unit" note={locked ? LOCKED : CHANGEABLE}>
          {locked ? (
            <ValueRow label="Type" value={medicineTypeLabel(type)} locked />
          ) : (
            <TypeRowSelect value={type} onChange={setType} />
          )}
          <ValueRow label="Dose unit" value={doseUnit(type)} locked={locked} />
        </Group>
        <Actions />
      </form>
    </Screen>
  )
}
