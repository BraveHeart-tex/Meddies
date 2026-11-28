'use client'

import { ChevronsUpDownIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { existingTypes, newTypes } from './type-tiles-model'
import { MenuTile } from './type-tiles-parts'

const items = [...existingTypes, ...newTypes]

/** Add medication's Type row with its menu open above it, the new Types after Drops. */
export function TypeMenuScreen() {
  return (
    <main className="flex min-h-dvh flex-col justify-end gap-5 bg-background px-5 py-6">
      <Card className="py-0">
        <Field>
          <Select items={items} defaultValue="suppository" defaultOpen>
            <SelectTrigger
              icon={ChevronsUpDownIcon}
              aria-labelledby="lab-483-type-label"
              className='grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)_1.375rem] gap-0 rounded-none border-0 bg-transparent px-4 text-body-lg focus-visible:-outline-offset-2 [&_svg:not([class*="size-"])]:size-5.5'
            >
              <span id="lab-483-type-label" className="text-base font-extrabold text-foreground">
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
                    <MenuTile type={item.value} />
                    {item.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Card>
    </main>
  )
}
