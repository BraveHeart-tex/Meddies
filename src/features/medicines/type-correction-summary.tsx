'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, BellOff, ChevronLeft, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { QuantityStepper } from '@/components/quantity-stepper'
import {
  medicineTypeLabel,
  parseQuantity,
  quantityLabel,
  quantityRule,
  stockCountProblem,
  unitName,
} from '@/lib/quantity-policy'
import type { MedicineRecord } from './contract'
import type { TypeCorrectionReview } from './type-correction-contract'
import { saveMessages } from '@/lib/save-messages'
import { useKnownOffline } from '@/lib/use-known-offline'
import type { SaveProblem } from '@/lib/session-saves'
import { MedicationsLink } from './medications-nav'
import { medicationRecordHref } from './routes'
import { TypeTile } from './type-tile'

export function CorrectionTypeChange({
  from,
  to,
}: {
  from: MedicineRecord['unit']
  to: MedicineRecord['unit']
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-body-lg font-extrabold">
      <span className="inline-flex items-center gap-2">
        <TypeTile type={from} />
        {medicineTypeLabel(from)}
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">to</span>
      <span className="inline-flex items-center gap-2">
        <TypeTile type={to} />
        {medicineTypeLabel(to)}
      </span>
    </span>
  )
}

type CorrectionScreenProps = {
  medicine: Pick<MedicineRecord, 'label' | 'strength' | 'stock'>
  review: TypeCorrectionReview
  onBack: () => void
  onCancel: () => void
}

function CorrectionScreen({
  medicine,
  title,
  onBack,
  locked,
  children,
}: Pick<CorrectionScreenProps, 'medicine' | 'onBack'> & {
  title: string
  locked?: boolean
  children: React.ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [title])
  return (
    <div className="flex flex-col gap-7 pb-5">
      <Button variant="ghost" className="-ml-3 self-start" onClick={onBack} disabled={locked}>
        <ChevronLeft data-icon="inline-start" aria-hidden="true" />
        Back
      </Button>
      <header className="flex flex-col gap-3">
        <p className="text-body-sm font-bold text-muted-foreground">
          {medicine.label}
          {medicine.strength ? ` · ${medicine.strength}` : ''}
        </p>
        <h1 ref={heading} tabIndex={-1} className="text-title font-extrabold outline-none">
          {title}
        </h1>
      </header>
      {children}
    </div>
  )
}

export function TypeCorrectionStock({
  medicine,
  review,
  value,
  onValueChange,
  onContinue,
  onBack,
  onCancel,
}: CorrectionScreenProps & {
  value: string
  onValueChange: (value: string) => void
  onContinue: () => void
}) {
  const id = useId()
  const { unit, fromUnit } = review
  const schema = z.object({
    count: z.string().superRefine((text, context) => {
      const message = text.trim() ? stockCountProblem(text, unit) : 'Enter your current count.'
      if (message) context.addIssue({ code: 'custom', message })
    }),
  })
  const form = useForm<z.input<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { count: value },
  })
  const units = unitName(null, unit)
  const { stock } = medicine
  return (
    <CorrectionScreen medicine={medicine} title={`How many ${units} do you have?`} onBack={onBack}>
      <form noValidate className="flex flex-col gap-7" onSubmit={form.handleSubmit(onContinue)}>
        <p className="text-body-lg">
          Count what you have now.
          {stock.tracked && (
            <>
              {' '}
              The saved count of {quantityLabel(stock.count, fromUnit)} can’t be used as a{' '}
              {unitName(1, unit)} count.
            </>
          )}
        </p>
        <FieldGroup>
          <Controller
            name="count"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={id}>Current count</FieldLabel>
                <QuantityStepper
                  ref={field.ref}
                  id={id}
                  label="Current count"
                  unit={unit}
                  value={field.value}
                  zero
                  grow
                  onValueChange={(text) => {
                    field.onChange(text)
                    onValueChange(text)
                  }}
                  onBlur={field.onBlur}
                  aria-invalid={fieldState.invalid}
                  aria-describedby={`${fieldState.invalid ? `${id}-error ` : ''}${id}-help`}
                />
                <FieldError id={`${id}-error`} errors={[fieldState.error]} />
                <FieldDescription id={`${id}-help`}>
                  {quantityRule(unit).step === 1
                    ? 'Enter a whole number.'
                    : `Enter the count in ${units}.`}{' '}
                  Zero is fine.
                </FieldDescription>
              </Field>
            )}
          />
        </FieldGroup>
        {stock.threshold !== undefined && (
          <Alert role="note" className="border-border-strong">
            <BellOff aria-hidden="true" />
            <AlertTitle>Your Low-stock alert will turn off</AlertTitle>
            <AlertDescription>
              Your current alert is set to Below {quantityLabel(stock.threshold, fromUnit)}. After
              saving, you can set a new alert in {units}. Earlier Stock records are kept.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg">
            Review changes
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel change
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">
          Nothing saves until you review and save all changes.
        </p>
      </form>
    </CorrectionScreen>
  )
}

/** Final review keeps its Session draft visible offline. Save and retry require an explicit action after reconnect. */
export function TypeCorrectionSummary({
  medicine,
  review,
  count,
  onReviewAmounts,
  onSave,
  onReviewSaved,
  onLeave,
  pending,
  problem,
  confirmed,
  onBack,
  onCancel,
}: CorrectionScreenProps & {
  medicine: CorrectionScreenProps['medicine'] & { id: string }
  count: string
  onReviewAmounts: () => void
  onSave: () => void
  onLeave?: () => void
  onReviewSaved?: () => Promise<void>
  pending?: boolean
  problem?: SaveProblem
  confirmed?: boolean
}) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const offline = useKnownOffline()
  const showOffline = offline && !pending && !confirmed
  const locked = pending || confirmed || problem === 'unconfirmed' || problem === 'conflict'
  const message = problem && correctionProblems[problem]
  async function reviewSaved() {
    setRefreshing(true)
    setRefreshFailed(false)
    try {
      await onReviewSaved?.()
    } catch {
      setRefreshFailed(true)
    } finally {
      setRefreshing(false)
    }
  }
  const { conflicts, stockTracked, unit, fromUnit } = review
  const doses = conflicts.filter(({ kind }) => kind !== 'schedule').length
  const schedules = conflicts.length - doses
  const threshold = medicine.stock.threshold
  const freshCount = parseQuantity(count)
  return (
    <CorrectionScreen
      medicine={medicine}
      title="Review your changes"
      onBack={onBack}
      locked={locked}
    >
      <dl className="rounded-xl border bg-card px-4">
        <div className="flex flex-col gap-2 py-4">
          <dt className="text-body-sm text-muted-foreground">Type across all records</dt>
          <dd>
            <CorrectionTypeChange from={fromUnit} to={unit} />
          </dd>
        </div>
        {conflicts.length > 0 && (
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 border-t py-4">
            <dt className="text-body-sm text-muted-foreground">Amounts you entered</dt>
            <dd className="col-start-1 text-body-lg font-extrabold">
              {doses} {doses === 1 ? 'dose' : 'doses'} · {schedules}{' '}
              {schedules === 1 ? 'schedule' : 'schedules'}
            </dd>
            <dd className="col-start-2 row-span-2 row-start-1">
              <Button
                variant="link"
                aria-label="Review entered amounts"
                onClick={onReviewAmounts}
                disabled={locked}
              >
                Review
              </Button>
            </dd>
          </div>
        )}
        {conflicts.length === 0 && (
          <div className="flex flex-col gap-1 border-t py-4">
            <dt className="text-body-sm text-muted-foreground">Saved amounts</dt>
            <dd className="text-body-lg font-extrabold">
              Same numbers, now in {unitName(null, unit)}
            </dd>
          </div>
        )}
        {stockTracked ? (
          <>
            <div className="flex flex-col gap-1 border-t py-4">
              <dt className="text-body-sm text-muted-foreground">Stock · Fresh count</dt>
              <dd className="text-body-lg font-extrabold">
                {freshCount === null ? null : quantityLabel(freshCount, unit)}
              </dd>
            </div>
            <div className="flex flex-col gap-1 border-t py-4">
              <dt className="text-body-sm text-muted-foreground">Low-stock alert</dt>
              <dd className="text-body-lg font-extrabold">
                {threshold === undefined
                  ? 'Off'
                  : `Below ${quantityLabel(threshold, fromUnit)} → Off`}
              </dd>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1 border-t py-4">
            <dt className="text-body-sm text-muted-foreground">Stock tracking</dt>
            <dd className="text-body-lg font-extrabold">Stays off</dd>
            <dd className="text-caption text-muted-foreground">Low-stock alert stays off.</dd>
          </div>
        )}
      </dl>
      {!pending && !problem && !confirmed && !showOffline && (
        <p className="text-body-sm text-muted-foreground">
          These changes save together. Dose times and Taken or Skipped stay as they are.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {pending && (
          <p role="status" className="text-body-sm">
            Saving your Type, amounts and Stock together.
          </p>
        )}
        {showOffline ? (
          <Alert>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>{saveMessages.offline}</AlertTitle>
            <AlertDescription>
              {saveMessages.offlineFormDetails} Nothing saves on its own.
            </AlertDescription>
          </Alert>
        ) : (
          message && (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>{message.title}</AlertTitle>
              <AlertDescription>{message.description}</AlertDescription>
            </Alert>
          )
        )}
        {refreshFailed && <p role="alert">Couldn’t load the saved medication. Try again.</p>}
        {confirmed ? (
          <p role="status" className="text-body-sm">
            Details saved
          </p>
        ) : (
          <Button
            size="lg"
            disabled={pending || refreshing || offline}
            onClick={problem === 'conflict' ? () => void reviewSaved() : onSave}
          >
            {pending
              ? 'Saving…'
              : showOffline
                ? saveMessages.connectToSave
                : (message?.action ?? 'Save details')}
          </Button>
        )}
        {problem === 'unconfirmed' || confirmed ? (
          <MedicationsLink
            href={medicationRecordHref(medicine.id)}
            onShow={onLeave}
            className={buttonVariants({ variant: 'outline' })}
          >
            Back to medication
          </MedicationsLink>
        ) : (
          !pending && (
            <Button variant="ghost" onClick={onCancel} disabled={refreshing}>
              Cancel change
            </Button>
          )
        )}
      </div>
    </CorrectionScreen>
  )
}

const correctionProblems = {
  unconfirmed: {
    title: 'That might not have saved.',
    description:
      'Your details are still here. Check your connection and retry with the same details.',
    action: 'Retry save',
  },
  rejected: {
    title: 'Your changes weren’t saved.',
    description:
      'Nothing changed. Your details are still here. Check the amounts before trying again.',
    action: 'Try saving again',
  },
  conflict: {
    title: 'This medication changed elsewhere.',
    description:
      'Your changes weren’t saved. Review the saved details and check every amount and your Stock count again.',
    action: 'Review saved medication',
  },
} satisfies Record<SaveProblem, { title: string; description: string; action: string }>
