'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { TimePicker } from '@/components/ui/time-picker'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { QuantityStepper } from '@/components/quantity-stepper'
import { recordExample } from './medication-record-model'
import { Notice } from './medication-record-parts'
const example = recordExample
const frameLink = (slug: string) => `/lab/${slug}`

export function ConfirmDrawer({ state }: { state: 'archive' | 'restore' | 'delete' | 'discard' }) {
  const [open, setOpen] = useState(true)
  const titles = {
    archive: 'Archive Magnesium?',
    restore: 'Restore Magnesium?',
    delete: 'Delete Vitamin D?',
    discard: 'Discard these changes?',
  }
  const descriptions = {
    archive: 'Magnesium leaves your Medications list. You can restore it later.',
    restore: 'Magnesium returns to your Medications list.',
    delete: 'This medication has never had a schedule or a dose. Deleting it cannot be undone.',
    discard: 'The changes you haven’t saved will be lost.',
  }
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-start justify-between gap-3">
            <DrawerTitle>{titles[state]}</DrawerTitle>
            <Button size="icon" variant="ghost" aria-label="Close" onClick={() => setOpen(false)}>
              <X />
            </Button>
          </div>
          <DrawerDescription>{descriptions[state]}</DrawerDescription>
        </DrawerHeader>
        {state === 'archive' && (
          <Notice>
            The schedule stops when the archive saves. Unsent dose, food and refill reminders are
            cancelled. History stays. Stock is unchanged.
          </Notice>
        )}
        {state === 'restore' && (
          <Notice>
            No schedule or reminders restart. Set a schedule separately when you’re ready.
          </Notice>
        )}
        <Link
          href={frameLink(
            state === 'archive'
              ? '292-s7'
              : state === 'restore'
                ? '292-s9'
                : state === 'delete'
                  ? '292-s11'
                  : '238-a3',
          )}
          className={buttonVariants({
            size: 'drawer',
            variant: state === 'delete' ? 'destructive' : 'default',
          })}
        >
          {state === 'archive'
            ? 'Archive medication'
            : state === 'restore'
              ? 'Restore medication'
              : state === 'delete'
                ? 'Delete medication'
                : 'Discard changes'}
        </Link>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {state === 'discard' ? 'Keep editing' : 'Cancel'}
        </Button>
      </DrawerContent>
    </Drawer>
  )
}

export function LateDrawer() {
  const [open, setOpen] = useState(true)
  const [amount, setAmount] = useState('1')
  const [time, setTime] = useState('08:30')
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-start justify-between gap-3">
            <DrawerTitle>Magnesium</DrawerTitle>
            <Button size="icon" variant="ghost" aria-label="Close" onClick={() => setOpen(false)}>
              <X />
            </Button>
          </div>
          <DrawerDescription>Scheduled for 08:00 · 1 tablet</DrawerDescription>
        </DrawerHeader>
        <FieldGroup>
          <Field>
            <FieldLabel id="late-outcome">What happened?</FieldLabel>
            <ToggleGroup
              aria-labelledby="late-outcome"
              variant="outline"
              value={['taken']}
              className="w-full"
            >
              <ToggleGroupItem value="taken" className="flex-1">
                <Check />
                Taken
              </ToggleGroupItem>
              <ToggleGroupItem value="skipped" className="flex-1">
                Skipped
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel id="late-when">Taken at</FieldLabel>
            <ToggleGroup
              aria-labelledby="late-when"
              variant="outline"
              value={['other']}
              className="w-full flex-wrap"
            >
              <ToggleGroupItem value="now">Now · 10:00</ToggleGroupItem>
              <ToggleGroupItem value="scheduled">At 08:00</ToggleGroupItem>
              <ToggleGroupItem value="other">Other</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel id="late-date">Taken date</FieldLabel>
            <ToggleGroup
              aria-labelledby="late-date"
              variant="outline"
              value={['today']}
              className="w-full flex-wrap"
            >
              <ToggleGroupItem value="yesterday">Sun 8 Nov</ToggleGroupItem>
              <ToggleGroupItem value="today">Mon 9 Nov</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="late-time">Taken time</FieldLabel>
            <TimePicker
              id="late-time"
              label="Taken time"
              value={time}
              onValueChange={setTime}
              now={() => new Date(example.now)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="late-amount">Amount</FieldLabel>
            <QuantityStepper
              id="late-amount"
              label="Amount"
              unit="tablet"
              value={amount}
              onValueChange={setAmount}
            />
          </Field>
        </FieldGroup>
        <Notice title="Strength for this dose: 200 mg">
          Your Taken time is before the change to 400 mg at 09:00. This dose will save as 200 mg.
        </Notice>
        <Button size="drawer">Save as taken</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </DrawerContent>
    </Drawer>
  )
}
