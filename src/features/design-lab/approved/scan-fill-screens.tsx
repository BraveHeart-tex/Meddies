'use client'

import { CheckIcon, ChevronsUpDownIcon, InfoIcon, X } from 'lucide-react'
import { useState } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CatalogMatch } from '@/features/catalog-products/contract'
import { MedicationsHeader } from '@/features/medicines/medications-header'
import { MedicationsScreen } from '@/features/medicines/medications-screen'
import { TypeTile } from '@/features/medicines/type-tile'
import { medicineTypeOptions, strengthHelp, type MedicineType } from '@/lib/quantity-policy'
import { FixtureQuery } from '../fixture-query'
import { NOW, routine } from '../lab-fixtures'
import { scanFillCopy } from './scan-fill-model'

// Add medicine's inset rows (B·Drawer, medicine-form.tsx): a 92px label column, 56px rows.
const textRow =
  'grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-0 px-4 not-first:border-t first:rounded-t-2xl last:rounded-b-2xl has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring'
const rowInput =
  'h-auto min-h-14 rounded-none border-0 bg-transparent px-0 text-body-lg font-bold placeholder:font-semibold focus-visible:outline-none disabled:bg-transparent aria-invalid:ring-0'
const rowHelp = 'col-span-full pb-3 text-caption'

/* B·Barcode read's status row: sage, the check tile, Barcode read over a caption, Scan again. */
function ReadRow({ caption }: { caption: string }) {
  return (
    <div
      role="status"
      className="flex min-h-15 items-center gap-3 rounded-xl bg-dose-taken py-2 pr-1.5 pl-2"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-card text-dose-taken-foreground [&>svg]:size-5.5">
        <CheckIcon aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="leading-tight font-extrabold text-dose-taken-foreground">
          {scanFillCopy.read}
        </span>
        <span className="text-body-sm leading-snug text-secondary-foreground">{caption}</span>
      </span>
      <Button type="button" variant="ghost" className="shrink-0 text-dose-taken-foreground">
        Scan again
      </Button>
    </div>
  )
}

function NameRow({ value }: { value: string | null }) {
  return (
    <Field className={textRow}>
      <FieldLabel htmlFor="medicine-label">Name</FieldLabel>
      <Input
        id="medicine-label"
        defaultValue={value ?? ''}
        placeholder="On your pack"
        autoComplete="off"
        autoCapitalize="words"
        className={rowInput}
      />
    </Field>
  )
}

function StrengthRow({ value, unit }: { value: string | null; unit: MedicineType | null }) {
  return (
    <Field className={textRow}>
      <FieldLabel htmlFor="medicine-strength">Strength</FieldLabel>
      <Input
        id="medicine-strength"
        defaultValue={value ?? ''}
        placeholder="Optional"
        autoComplete="off"
        aria-describedby="medicine-strength-help"
        className={rowInput}
      />
      <FieldDescription id="medicine-strength-help" className={rowHelp}>
        {strengthHelp(unit)}
      </FieldDescription>
    </Field>
  )
}

function StockRow() {
  return (
    <Field className="grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)_auto] items-center gap-0 px-4 not-first:border-t first:rounded-t-2xl last:rounded-b-2xl has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring">
      <FieldLabel htmlFor="medicine-stock">Stock</FieldLabel>
      <Input
        id="medicine-stock"
        placeholder="Optional"
        inputMode="decimal"
        autoComplete="off"
        aria-describedby="medicine-stock-help"
        className={rowInput}
      />
      <FieldDescription id="medicine-stock-help" className={rowHelp}>
        How many you have now. Leave empty to skip tracking.
      </FieldDescription>
    </Field>
  )
}

/* The Type row starts unset; `note` is the unsupported-form line under it (473·B3). */
function TypeRow({
  unit,
  onUnit,
  menuOpen,
  note,
}: {
  unit: MedicineType | null
  onUnit: (unit: MedicineType | null) => void
  menuOpen: boolean
  note?: string
}) {
  return (
    <Field className="not-first:border-t">
      <Select
        items={medicineTypeOptions}
        value={unit}
        onValueChange={(value) => onUnit(value as MedicineType | null)}
        defaultOpen={menuOpen}
      >
        <SelectTrigger
          icon={ChevronsUpDownIcon}
          aria-labelledby="medicine-unit-label"
          aria-describedby={note ? 'medicine-unit-note' : undefined}
          className='grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)_1.375rem] gap-0 rounded-none border-0 bg-transparent px-4 text-body-lg focus-visible:-outline-offset-2 [&_svg:not([class*="size-"])]:size-5.5'
        >
          <span id="medicine-unit-label" className="text-base font-extrabold text-foreground">
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
      {note && (
        <FieldDescription
          id="medicine-unit-note"
          className="flex gap-2 px-4 pb-3 text-caption text-foreground [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0"
        >
          <InfoIcon aria-hidden="true" />
          <span>{note}</span>
        </FieldDescription>
      )}
    </Field>
  )
}

/* 473·B1-B4 The Add medicine form after a scan: the approved B·Barcode read row, then the usual
   inset rows in their usual order. Filled rows show the lookup's values, empty rows their manual
   prompts, and Type starts unset. An unsupported form adds the note as Type's help line. */
function ScanFillForm({ match, menuOpen }: { match: CatalogMatch; menuOpen: boolean }) {
  const [unit, setUnit] = useState<MedicineType | null>(match.type)
  return (
    <form noValidate className="flex flex-col gap-3.5" onSubmit={(event) => event.preventDefault()}>
      <ReadRow caption={scanFillCopy.check} />
      <Card className="gap-0 py-0">
        <FieldGroup className="gap-0">
          <NameRow value={match.name} />
          <TypeRow
            unit={unit}
            onUnit={setUnit}
            menuOpen={menuOpen}
            note={match.supportedForm ? undefined : scanFillCopy.unsupportedNote}
          />
          <StrengthRow value={match.strength} unit={unit} />
          <StockRow />
        </FieldGroup>
      </Card>
      <Button type="submit" size="drawer" className="w-full whitespace-normal">
        Save medication
      </Button>
    </form>
  )
}

/** Add medicine (`B·Drawer`) over Medications, returned from the Scanner with `match` filled. */
export function ScanFillScreen({
  match,
  menuOpen = false,
}: {
  match: CatalogMatch
  menuOpen?: boolean
}) {
  return (
    <FixtureQuery {...routine}>
      <AppShell current="/medications">
        <ScreenStack>
          <MedicationsHeader />
          <MedicationsScreen initialNow={NOW} serverEntry />
        </ScreenStack>
      </AppShell>
      <Drawer open>
        <DrawerContent>
          <div className="-mt-2 flex flex-col gap-3.5">
            <DrawerHeader className="-mx-2 -my-1 grid min-h-12 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-0 text-center">
              <DrawerClose
                render={<Button variant="ghost" size="icon" className="rounded-full" />}
                aria-label="Close"
              >
                <X aria-hidden="true" data-icon="inline-start" />
              </DrawerClose>
              <DrawerTitle tabIndex={-1} className="text-heading outline-none">
                Add medication
              </DrawerTitle>
            </DrawerHeader>
            <ScanFillForm match={match} menuOpen={menuOpen} />
          </div>
        </DrawerContent>
      </Drawer>
    </FixtureQuery>
  )
}
