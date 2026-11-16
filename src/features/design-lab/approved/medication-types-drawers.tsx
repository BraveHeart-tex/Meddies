'use client'

import { ChevronsUpDownIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Field, FieldGroup, FieldTitle } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { OutcomeChoice } from '@/features/schedules/outcome-choice'
import { labTypes, typeRules, type LabType } from './medication-types-model'
import { AmountCard } from './medication-types-parts'
import { TypeTile } from './medication-types-tile-parts'

const noop = () => {}

/** Add medication's Type row; the menu opens above it, over Name. */
export function TypeRow({ type, open }: { type: LabType | null; open: boolean }) {
  const items = labTypes.map((value) => ({ value, label: typeRules[value].label }))
  return (
    <Field className="not-first:border-t">
      <Select items={items} defaultValue={type} defaultOpen={open}>
        <SelectTrigger
          icon={ChevronsUpDownIcon}
          aria-labelledby="lab-type-label"
          className='grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)_1.375rem] gap-0 rounded-none border-0 bg-transparent px-4 text-body-lg focus-visible:-outline-offset-2 [&_svg:not([class*="size-"])]:size-5.5'
        >
          <span id="lab-type-label" className="text-base font-extrabold text-foreground">
            Type
          </span>
          <SelectValue
            placeholder="Choose"
            className="font-bold in-data-placeholder:font-semibold"
          />
        </SelectTrigger>
        <SelectContent side="top" align="end" className="w-61 rounded-lg p-0.5">
          {items.map((item) => (
            <SelectItem
              key={item.value}
              value={item.value}
              className="min-h-12 pl-1.5 font-extrabold data-[selected]:bg-transparent data-[selected]:text-foreground data-[selected]:data-highlighted:bg-secondary"
            >
              <span className="flex items-center gap-2.5">
                <TypeTile type={item.value} />
                {item.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

/** Shared states: schedule setup and edit, dose logging and changes, and routine wording. */

export function DoseDrawer({
  type,
  title,
  description,
  amount,
  error,
  save,
  unscheduled = false,
  when = 'now',
}: {
  type: LabType
  title: string
  description: string
  amount: string
  error?: string
  save: string
  unscheduled?: boolean
  /** The Taken at choice; a change starts on the saved time. */
  when?: 'now' | 'scheduled'
}) {
  return (
    <Drawer open>
      <DrawerContent>
        <DrawerHeader className="grid grid-cols-[1fr_auto] items-center gap-3.5">
          <TypeTile type={type} size="lg" />
          <div className="order-3 col-span-full flex min-w-0 flex-col gap-0.75">
            <DrawerTitle className="text-[1.4375rem] leading-[1.1]">{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </div>
          <DrawerClose
            render={<Button variant="outline" size="icon" className="rounded-full border-border" />}
            aria-label="Close dose details"
          >
            <X aria-hidden="true" data-icon="inline-start" />
          </DrawerClose>
        </DrawerHeader>
        <div className="flex flex-col gap-4">
          {!unscheduled && (
            <OutcomeChoice doseId="lab" value="Taken" disabled={() => false} onChoose={noop} />
          )}
          <FieldGroup className="gap-4">
            <Field className="gap-2.5">
              <FieldTitle className="font-extrabold">Taken at</FieldTitle>
              <ToggleGroup
                variant="outline"
                className="w-full"
                defaultValue={[when]}
                aria-label="Taken at"
              >
                <ToggleGroupItem value="now" className="flex-1">
                  Now · 10:00
                </ToggleGroupItem>
                {!unscheduled && (
                  <ToggleGroupItem value="scheduled" className="flex-1">
                    At 08:00
                  </ToggleGroupItem>
                )}
                <ToggleGroupItem value="other">Other</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <AmountCard id="lab-dose-amount" type={type} initial={amount} error={error} />
          </FieldGroup>
          <Button size="drawer" className="w-full">
            {save}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
