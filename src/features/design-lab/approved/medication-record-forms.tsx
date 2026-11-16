'use client'
import Link from 'next/link'
import { useId, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TimePicker } from '@/components/ui/time-picker'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { cn } from '@/lib/utils'
import { vitaminD } from '../lab-fixtures'
import { recordExample, type RecordState } from './medication-record-model'
import { Heading, LockedType, Notice } from './medication-record-parts'
const example = recordExample
const medicine = example.medicine
const frameLink = (slug: string) => `/lab/${slug}`

export function EditForm({
  strength = false,
  state = 'fix',
}: {
  strength?: boolean
  state?: RecordState
}) {
  const id = useId()
  const isStrength = strength
  const [label, setLabel] = useState(state === 'unused' ? vitaminD.label : medicine.label)
  const [value, setValue] = useState(
    isStrength ? '600 mg' : state === 'unused' ? '' : state === 'revision' ? '200 mg' : '400 mg',
  )
  const [date, setDate] = useState<string>(example.today)
  const [time, setTime] = useState('09:30')
  const typeOptions = [
    { value: 'tablet', label: 'Tablet' },
    { value: 'capsule', label: 'Capsule' },
    { value: 'liquid', label: 'Liquid' },
    { value: 'inhaler', label: 'Inhaler' },
    { value: 'drops', label: 'Drops' },
  ]
  const [type, setType] = useState<string | null>('tablet')
  const saving = state === 'saving'
  const invalid = state === 'invalid'
  const [submitted, setSubmitted] = useState(false)
  const needsError = invalid || submitted
  const historical = state === 'revision'
  return (
    <>
      <MedicationBackRow href={frameLink('238-a3')}>
        {state === 'unused' ? 'Vitamin D' : 'Magnesium'}
      </MedicationBackRow>
      <MedicationIdentity
        medicine={
          state === 'unused'
            ? vitaminD
            : state === 'revision'
              ? { ...medicine, strength: '200 mg' }
              : medicine
        }
        eyebrow={historical ? 'Earlier strength' : undefined}
      />
      <Heading
        description={
          isStrength
            ? 'Keep earlier doses as they are. Choose when you started the new strength.'
            : 'Fix details that were entered wrongly. Doses from this strength period will show the fixed details.'
        }
      >
        {isStrength ? 'Change strength' : 'Fix a mistake'}
      </Heading>
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
        }}
      >
        <fieldset disabled={saving} className="flex min-w-0 flex-col gap-5">
          <FieldGroup>
            {!isStrength && (
              <Field>
                <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
                <Input
                  id={`${id}-name`}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </Field>
            )}
            <Field data-invalid={needsError && !value}>
              <FieldLabel htmlFor={`${id}-strength`}>
                {isStrength ? 'New strength' : 'Strength (optional)'}
              </FieldLabel>
              <Input
                id={`${id}-strength`}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                aria-describedby={`${id}-strength-help`}
              />
              <FieldDescription id={`${id}-strength-help`}>
                {isStrength
                  ? 'Currently 400 mg. Enter the strength on the new pack.'
                  : state === 'unused'
                    ? 'Optional. Enter the strength on the pack, such as 1000 IU.'
                    : historical
                      ? 'Period: Mon 2 Nov to Mon 9 Nov at 09:00. The current 400 mg period stays the same.'
                      : 'This period: Mon 9 Nov from 09:00 onwards. Changing strength here fixes a mistake in saved doses too.'}
              </FieldDescription>
            </Field>
            {isStrength ? (
              <>
                <Field data-invalid={needsError}>
                  <FieldLabel htmlFor={`${id}-date`}>Started on</FieldLabel>
                  <DatePicker
                    id={`${id}-date`}
                    label="Started on"
                    value={date}
                    onValueChange={setDate}
                    today={example.today}
                    max={example.today}
                    aria-invalid={needsError}
                    aria-describedby={`${id}-date-help`}
                  />
                  <FieldDescription id={`${id}-date-help`}>
                    Times are in Türkiye time. No later than now. No earlier than the latest dose
                    you recorded as Taken: {formatShortDay(example.latestTaken, example.today)} at{' '}
                    {formatTime(example.latestTaken)}.
                  </FieldDescription>
                </Field>
                <Field data-invalid={needsError}>
                  <FieldLabel htmlFor={`${id}-time`}>Started at</FieldLabel>
                  <TimePicker
                    id={`${id}-time`}
                    label="Started at"
                    value={invalid ? '07:00' : time}
                    onValueChange={setTime}
                    now={() => new Date(example.now)}
                    aria-invalid={needsError}
                    aria-describedby={needsError ? `${id}-time-error` : undefined}
                  />
                  {needsError && (
                    <FieldError id={`${id}-time-error`}>
                      Choose 08:05 or later today, up to 10:00. Earlier doses must keep their saved
                      strength.
                    </FieldError>
                  )}
                </Field>
              </>
            ) : state === 'unused' ? (
              <Field>
                <FieldLabel htmlFor={`${id}-type`}>Type</FieldLabel>
                <Select items={typeOptions} value={type} onValueChange={setType}>
                  <SelectTrigger id={`${id}-type`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="capsule">Capsule</SelectItem>
                    <SelectItem value="liquid">Liquid</SelectItem>
                    <SelectItem value="inhaler">Inhaler</SelectItem>
                    <SelectItem value="drops">Drops</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Tablets are counted in tablets. Type can change until a schedule or dose is added.
                </FieldDescription>
              </Field>
            ) : (
              <LockedType />
            )}
          </FieldGroup>
        </fieldset>
        {state === 'offline' && (
          <Notice>
            Your details stay here for this session. Connect to the internet, then save.
          </Notice>
        )}
        {state === 'failure' && (
          <Notice warning title="Your change wasn’t saved">
            Your details are still here. Check your connection and try again.
          </Notice>
        )}
        {state === 'uncertain' && (
          <Notice warning title="That might not have saved">
            Your details are still here. Check your connection and retry this save.
          </Notice>
        )}
        {state === 'conflict' && (
          <Notice warning title="This medication changed">
            Nothing from this edit was applied. Review the saved details before editing again.
          </Notice>
        )}
        {state === 'conflict' ? (
          <Link href={frameLink('238-a3')} className={buttonVariants({ size: 'lg' })}>
            Review saved medication
          </Link>
        ) : (
          <Button type="submit" size="lg" disabled={saving || state === 'offline'}>
            {saving
              ? 'Saving...'
              : state === 'offline'
                ? 'Connect to save'
                : state === 'uncertain'
                  ? 'Retry save'
                  : isStrength
                    ? 'Save strength change'
                    : 'Save fixed details'}
          </Button>
        )}
        <Link
          href={frameLink('238-a3')}
          aria-disabled={saving || undefined}
          tabIndex={saving ? -1 : undefined}
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            saving && 'pointer-events-none opacity-50',
          )}
        >
          Cancel
        </Link>
      </form>
    </>
  )
}
