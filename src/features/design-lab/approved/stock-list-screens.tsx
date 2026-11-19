'use client'

import { ChevronRightIcon, ChevronsUpDownIcon, X } from 'lucide-react'
import type { ReactNode } from 'react'
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
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationsHeader } from '@/features/medicines/medications-header'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { TypeTile } from '@/features/medicines/type-tile'
import { MedicationRow } from '@/features/schedules/medication-row'
import { routineSummary } from '@/features/schedules/medication-routine-groups'
import {
  medicineTypeOptions,
  strengthHelp,
  unitName,
  type MedicineType,
} from '@/lib/quantity-policy'
import { FixtureQuery } from '../fixture-query'
import {
  amoxicillin,
  amoxicillinSchedule,
  iron,
  ironSchedule,
  magnesium,
  magnesiumSchedule,
  NOW,
  vitaminD,
} from '../lab-fixtures'
import {
  listFixtures,
  listMedicines,
  omega3,
  omega3Schedule,
  omega3Tracked,
  stockCopy,
  stockLeft,
} from './stock-model'

const noop = () => {}
const plural = (unit: MedicineType) => unitName(null, unit)
const countOf = (medicine: Medicine) => (medicine.stock?.tracked ? medicine.stock.count : null)

/* 392·A3 A Medications row (238·A2's MedicationRow) with the count as its own quiet line under
   the facts. Rows without stock stay MedicationRow, unchanged. */
function StockRow({
  medicine,
  scheduleSummary,
}: {
  medicine: Medicine
  scheduleSummary: string | null
}) {
  const count = countOf(medicine) ?? 0
  const facts = [medicine.strength, medicine.unit].filter(Boolean).join(' · ')
  const left = stockLeft(count, medicine.unit)
  return (
    <Item render={<li />} variant="card" className="p-3.5 [&>svg]:size-5">
      <TypeTile type={medicine.unit} size="md" />
      <ItemContent className="gap-0.75">
        <ItemTitle>
          <h4>{medicine.label}</h4>
        </ItemTitle>
        <ItemDescription>{facts}</ItemDescription>
        <ItemDescription>{left}</ItemDescription>
        {scheduleSummary !== null && <p className="text-label font-bold">{scheduleSummary}</p>}
      </ItemContent>
      <ChevronRightIcon aria-hidden="true" className="text-muted-foreground" />
      <MedicationsLink
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        href={`/medications?medicine=${medicine.id}`}
        aria-label={`View details for ${medicine.label}`}
      >
        <span className="sr-only">View details</span>
      </MedicationsLink>
    </Item>
  )
}

const listed = (id: string) => listMedicines.find((medicine) => medicine.id === id) ?? omega3

/** On a schedule: Magnesium, Iron, Amoxicillin, Omega-3; No schedule: Vitamin D. */
const scheduledRows = [
  { medicine: listed(magnesium.id), schedule: magnesiumSchedule },
  { medicine: listed(iron.id), schedule: ironSchedule },
  { medicine: listed(amoxicillin.id), schedule: amoxicillinSchedule },
  { medicine: omega3Tracked, schedule: omega3Schedule },
]

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-2.5">
      <h3 className="px-1 pt-1 text-label leading-none font-extrabold tracking-eyebrow text-muted-foreground uppercase">
        {label}
      </h3>
      <ul className="flex flex-col gap-2.5">{children}</ul>
    </section>
  )
}

function StockList() {
  return (
    <>
      <Group label="On a schedule">
        {scheduledRows.map(({ medicine, schedule }) =>
          countOf(medicine) === null ? (
            <MedicationRow
              key={medicine.id}
              medicine={medicine}
              scheduleSummary={routineSummary(schedule, NOW)}
            />
          ) : (
            <StockRow
              key={medicine.id}
              medicine={medicine}
              scheduleSummary={routineSummary(schedule, NOW)}
            />
          ),
        )}
      </Group>
      <Group label="No schedule">
        <StockRow medicine={listed(vitaminD.id)} scheduleSummary={null} />
      </Group>
    </>
  )
}

function ListFrame({ children }: { children?: ReactNode }) {
  return (
    <FixtureQuery {...listFixtures}>
      <AppShell current="/medications">
        <ScreenStack>
          <MedicationsHeader />
          <StockList />
        </ScreenStack>
      </AppShell>
      {children}
    </FixtureQuery>
  )
}

export function StockListScreen() {
  return <ListFrame />
}

// Add medicine's inset rows (B·Drawer): a 92px label column, 56px minimum height.
const textRow =
  'grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-0 px-4 not-first:border-t first:rounded-t-2xl has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring'
const rowInput =
  'h-auto min-h-14 rounded-none border-0 bg-transparent px-0 text-body-lg font-bold placeholder:font-semibold focus-visible:outline-none disabled:bg-transparent aria-invalid:ring-0'
const rowHelp = 'col-span-full pb-3 text-caption'

const addUnit: MedicineType = 'capsule'
const addCount = '28'

/* 392·A4 Stock row: a fourth inset row, a plain number with the dose unit after it. Typing only;
   empty leaves stock off, and the unit follows the chosen Type. */
function InsetCountRow() {
  return (
    <Field className="grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)_auto] items-center gap-0 px-4 not-first:border-t has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring">
      <FieldLabel htmlFor="medicine-stock">{stockCopy.addLabel}</FieldLabel>
      <Input
        id="medicine-stock"
        defaultValue={addCount}
        placeholder="Optional"
        inputMode="decimal"
        autoComplete="off"
        aria-describedby="medicine-stock-unit medicine-stock-help"
        className={rowInput}
      />
      <span id="medicine-stock-unit" className="pl-2 font-bold text-muted-foreground">
        {plural(addUnit)}
      </span>
      <FieldDescription id="medicine-stock-help" className={rowHelp}>
        {stockCopy.addHelp(plural(addUnit))}
      </FieldDescription>
    </Field>
  )
}

/** Add medicine's form (its production rows) with Omega-3 entered and the count row. */
function AddForm() {
  return (
    <form noValidate className="flex flex-col gap-3.5" onSubmit={(event) => event.preventDefault()}>
      <Card className="gap-0 py-0">
        <FieldGroup className="gap-0">
          <Field className={textRow}>
            <FieldLabel htmlFor="medicine-label">Name</FieldLabel>
            <Input
              id="medicine-label"
              defaultValue={omega3.label}
              autoComplete="off"
              className={rowInput}
            />
          </Field>
          <Field className="not-first:border-t">
            <Select items={medicineTypeOptions} value={addUnit} onValueChange={noop}>
              <SelectTrigger
                icon={ChevronsUpDownIcon}
                aria-labelledby="medicine-unit-label"
                className='grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)_1.375rem] gap-0 rounded-none border-0 bg-transparent px-4 text-body-lg focus-visible:-outline-offset-2 [&_svg:not([class*="size-"])]:size-5.5'
              >
                <span id="medicine-unit-label" className="text-base font-extrabold text-foreground">
                  Type
                </span>
                <SelectValue placeholder="Choose" className="font-bold" />
              </SelectTrigger>
              <SelectContent side="top" align="end" className="w-61 rounded-lg p-0.5">
                {medicineTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="min-h-12">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className={textRow}>
            <FieldLabel htmlFor="medicine-strength">Strength</FieldLabel>
            <Input
              id="medicine-strength"
              defaultValue={omega3.strength ?? ''}
              autoComplete="off"
              aria-describedby="medicine-strength-help"
              className={rowInput}
            />
            <FieldDescription id="medicine-strength-help" className={rowHelp}>
              {strengthHelp(addUnit)}
            </FieldDescription>
          </Field>
          <InsetCountRow />
        </FieldGroup>
      </Card>
      <Button type="submit" size="drawer" className="w-full">
        Save medication
      </Button>
    </form>
  )
}

/** Add medicine (`B·Drawer`) over Medications with a Capsule chosen and a count of 28. */
export function StockAddScreen() {
  return (
    <ListFrame>
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
            <AddForm />
          </div>
        </DrawerContent>
      </Drawer>
    </ListFrame>
  )
}
