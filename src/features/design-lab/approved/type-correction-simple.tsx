'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, BellOff, ChevronLeft } from 'lucide-react'
import { AppShell } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { QuantityStepper } from '@/components/quantity-stepper'
import { Field, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { DiscardMedicineChanges } from '@/features/medicines/discard-medicine-changes'
import { formatShortDay } from '@/lib/calendar-date'
import { quantityLabel, quantityProblem, stockCountProblem } from '@/lib/quantity-policy'
import { TODAY } from '../lab-fixtures'
import { correctionDoseDays, reviewedCorrectionAmounts } from './type-correction-model'

import { TypeChange } from './type-correction-parts'

type Step = 'review' | 'amount' | 'stock' | 'save'

/** #440 revised direction. A single path with one question and one primary action per screen.
 * All entries remain local while navigating; only the final action represents the complete save.
 * Synthetic history has 24 incompatible doses and 2 Schedule amounts. No replacement is inferred.
 */
export function SimpleCorrection({
  initialStep = 'review',
  initialIndex = 0,
  initiallyInvalid = false,
  compatibleUntracked = false,
  onEditDetails,
  initiallyDiscarding = false,
  saveActions,
  lockReview = false,
  strength = '400 mg',
}: {
  initialStep?: Step
  initialIndex?: number
  initiallyInvalid?: boolean
  compatibleUntracked?: boolean
  onEditDetails?: () => void
  initiallyDiscarding?: boolean
  saveActions?: ReactNode
  lockReview?: boolean
  strength?: string
}) {
  const id = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const [step, setStep] = useState<Step>(initialStep)
  const [index, setIndex] = useState(initialIndex)
  const [amounts, setAmounts] = useState<Record<number, string>>(() => {
    const reviewed = initialStep === 'save' || initialStep === 'stock' ? 26 : initialIndex
    return Object.fromEntries(
      Object.entries(reviewedCorrectionAmounts).filter(([key]) => Number(key) < reviewed),
    )
  })
  const [count, setCount] = useState(initialStep === 'save' ? '30' : '')
  const [invalid, setInvalid] = useState(initiallyInvalid)
  const [discard, setDiscard] = useState(initiallyDiscarding)
  const [saving, setSaving] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [checkingEntries, setCheckingEntries] = useState(false)
  useEffect(() => {
    heading.current?.focus()
  }, [step, index, cancelled])
  const value = step === 'stock' ? count : (amounts[index] ?? '')
  const schedule = index >= 24
  const earlierSchedule = index === 25
  const title =
    step === 'review'
      ? 'Change to Capsule?'
      : step === 'amount'
        ? schedule
          ? 'How many capsules per dose?'
          : 'How many capsules was this dose?'
        : step === 'stock'
          ? 'How many capsules do you have?'
          : 'Review your changes'
  const error =
    step === 'stock'
      ? value.trim()
        ? stockCountProblem(value, 'capsule')
        : 'Enter your current count.'
      : quantityProblem(value, 'capsule')
  function go(next: Step) {
    setInvalid(false)
    setStep(next)
  }
  function back() {
    setInvalid(false)
    if (step === 'amount' && checkingEntries && index === 0) go('save')
    else if (step === 'amount' && index > 0) setIndex(index - 1)
    else if (step === 'amount') go('review')
    else if (step === 'stock') {
      setIndex(25)
      go('amount')
    } else if (step === 'save') go(compatibleUntracked ? 'review' : 'stock')
    else if (onEditDetails) onEditDetails()
    else setDiscard(true)
  }
  function next(destination?: Step) {
    if (error) {
      setInvalid(true)
      document.getElementById(id)?.focus()
      return
    }
    setInvalid(false)
    if (destination) go(destination)
    else if (step === 'stock' || (checkingEntries && index === 25)) go('save')
    else if (index < 25) setIndex(index + 1)
    else go('stock')
  }
  if (cancelled)
    return (
      <AppShell current="/medications">
        <div className="flex flex-col gap-5 pt-5">
          <h1 ref={heading} tabIndex={-1} className="text-title outline-none">
            No changes saved
          </h1>
          <p className="text-body-sm">
            Magnesium is still Tablet. Your doses, schedules and Stock are unchanged.
          </p>
          <Button
            size="lg"
            onClick={() => {
              setCancelled(false)
              setAmounts({})
              setCount('')
              setIndex(0)
              go('review')
            }}
          >
            Edit details
          </Button>
        </div>
      </AppShell>
    )
  return (
    <AppShell current="/medications">
      <div className="flex flex-col gap-7 pb-5">
        <Button
          variant="ghost"
          className="-ml-3 self-start"
          onClick={back}
          disabled={saving || lockReview}
        >
          <ChevronLeft data-icon="inline-start" aria-hidden="true" />
          {step === 'review' ? 'Edit details' : 'Back'}
        </Button>
        <header className="space-y-3">
          <p className="text-body-sm font-bold text-muted-foreground">Magnesium · {strength}</p>
          <h1 ref={heading} tabIndex={-1} className="text-title font-extrabold outline-none">
            {title}
          </h1>
        </header>
        {step === 'review' ? (
          <>
            <div className="space-y-3">
              <Card className="gap-3 px-4">
                <TypeChange />
                <div className="border-t pt-3">
                  <h2 className="text-body-sm font-extrabold">Applies to all Magnesium records</h2>
                  <p className="text-body-sm text-muted-foreground">
                    Every strength period, dose and schedule.
                  </p>
                </div>
              </Card>
              <Card className="gap-0 px-4 py-0">
                <div className="space-y-1 py-3">
                  <h2 className="text-body-sm font-extrabold">
                    Compatible amounts keep their number
                  </h2>
                  <p className="text-body-sm text-muted-foreground">
                    1 tablet is recorded as 1 capsule.
                  </p>
                </div>
                <div className="space-y-1 border-t py-3">
                  <h2 className="text-body-sm font-extrabold">
                    {compatibleUntracked ? 'All saved amounts fit' : '26 amounts to check'}
                  </h2>
                  <p className="text-body-sm text-muted-foreground">
                    {compatibleUntracked
                      ? 'Stock tracking stays off.'
                      : 'Enter a whole number for each of 24 doses and 2 schedule amounts. Then count your capsules.'}
                  </p>
                </div>
              </Card>
              <p className="px-1 text-caption text-muted-foreground">
                Name and strength changes apply only to this period and its doses. Nothing is saved
                yet.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                size="lg"
                onClick={() => {
                  setCheckingEntries(false)
                  go(compatibleUntracked ? 'save' : 'amount')
                }}
              >
                {compatibleUntracked ? 'Review changes' : 'Check first amount'}
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Button>
              <Button variant="ghost" onClick={() => setDiscard(true)}>
                Cancel change
              </Button>
            </div>
          </>
        ) : step === 'amount' || step === 'stock' ? (
          <form
            noValidate
            className="flex flex-col gap-7"
            onSubmit={(event) => {
              event.preventDefault()
              next()
            }}
          >
            {step === 'amount' ? (
              <section className="space-y-3 rounded-xl border bg-card p-4">
                <p className="text-caption font-bold text-muted-foreground">
                  Amount {index + 1} of 26
                </p>
                <p className="text-body-lg font-extrabold">
                  {schedule
                    ? earlierSchedule
                      ? 'Earlier schedule · 08:00'
                      : 'Current schedule · 08:00'
                    : `Taken · ${formatShortDay(correctionDoseDays[index], TODAY)} at 08:10`}
                </p>
                {schedule && (
                  <p className="text-body-sm text-muted-foreground">
                    {earlierSchedule
                      ? `${formatShortDay('2026-10-01', TODAY)} to ${formatShortDay('2026-10-31', TODAY)}`
                      : `From ${formatShortDay('2026-11-01', TODAY)}`}{' '}
                    · Every day
                  </p>
                )}
                <p className="text-body-sm">
                  Saved as <strong>{earlierSchedule ? '1½ tablets' : '½ tablet'}</strong>
                </p>
              </section>
            ) : (
              <p className="text-body-lg">
                Count what you have now. The saved count of 18 tablets can’t be used as a capsule
                count.
              </p>
            )}
            <Field data-invalid={invalid}>
              <FieldLabel htmlFor={id}>{step === 'stock' ? 'Current count' : 'Amount'}</FieldLabel>
              <QuantityStepper
                id={id}
                label={step === 'stock' ? 'Current count' : 'Amount'}
                unit="capsule"
                value={value}
                zero={step === 'stock'}
                onValueChange={(nextValue) => {
                  if (step === 'stock') setCount(nextValue)
                  else setAmounts((previous) => ({ ...previous, [index]: nextValue }))
                }}
                aria-invalid={invalid}
                aria-describedby={invalid ? `${id}-error ${id}-help` : `${id}-help`}
                grow
              />
              <FieldError id={`${id}-error`}>{invalid ? error : null}</FieldError>
              <FieldDescription id={`${id}-help`}>
                {step === 'stock'
                  ? 'Enter a whole number. Zero is fine.'
                  : 'Enter the capsule amount for this dose. Use a whole number.'}
              </FieldDescription>
            </Field>
            {step === 'stock' && (
              <Alert role="note" className="border-border-strong">
                <BellOff aria-hidden="true" />
                <AlertTitle>Your Low-stock alert will turn off</AlertTitle>
                <AlertDescription>
                  Your current alert is set to Below 5 tablets. After saving, you can set a new
                  alert in capsules. Earlier Stock records are kept.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-2">
              <Button type="submit" size="lg">
                {step === 'stock'
                  ? 'Review changes'
                  : index === 25
                    ? checkingEntries
                      ? 'Back to review'
                      : 'Continue to Stock'
                    : 'Continue'}
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Button>
              {checkingEntries && index < 25 && (
                <Button variant="outline" onClick={() => next('save')}>
                  Back to review
                </Button>
              )}
              <Button variant="ghost" onClick={() => setDiscard(true)}>
                Cancel change
              </Button>
            </div>
            <p className="text-caption text-muted-foreground">
              Nothing saves until you review and save all changes.
            </p>
          </form>
        ) : (
          <>
            <dl className="space-y-0 rounded-xl border bg-card px-4">
              <div className="space-y-2 border-b py-4">
                <dt className="text-body-sm text-muted-foreground">Type across all records</dt>
                <dd>
                  <TypeChange />
                </dd>
              </div>
              {compatibleUntracked ? (
                <>
                  <div className="space-y-1 border-b py-4">
                    <dt className="text-body-sm text-muted-foreground">Saved amounts</dt>
                    <dd className="text-body-lg font-extrabold">Same numbers, now in capsules</dd>
                  </div>
                  <div className="space-y-1 py-4">
                    <dt className="text-body-sm text-muted-foreground">Stock tracking</dt>
                    <dd className="text-body-lg font-extrabold">Stays off</dd>
                    <dd className="text-caption text-muted-foreground">
                      Low-stock alert stays off.
                    </dd>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 border-b py-4">
                    <dt className="text-body-sm text-muted-foreground">Amounts you entered</dt>
                    <dd className="col-start-1 text-body-lg font-extrabold">
                      24 doses · 2 schedules
                    </dd>
                    <dd className="col-start-2 row-start-1 row-span-2">
                      <Button
                        variant="link"
                        disabled={saving || lockReview}
                        aria-label="Review entered amounts"
                        onClick={() => {
                          setIndex(0)
                          setCheckingEntries(true)
                          go('amount')
                        }}
                      >
                        Review
                      </Button>
                    </dd>
                  </div>
                  <div className="space-y-1 border-b py-4">
                    <dt className="text-body-sm text-muted-foreground">Stock · Fresh count</dt>
                    <dd className="text-body-lg font-extrabold">
                      {quantityLabel(Number(count), 'capsule')}
                    </dd>
                  </div>
                  <div className="space-y-1 py-4">
                    <dt className="text-body-sm text-muted-foreground">Low-stock alert</dt>
                    <dd className="text-body-lg font-extrabold">Below 5 tablets → Off</dd>
                  </div>
                </>
              )}
            </dl>
            {saveActions ?? (
              <>
                <p className="text-body-sm text-muted-foreground">
                  These changes save together. Dose times and Taken or Skipped stay as they are.
                </p>
                {saving && (
                  <Alert>
                    <AlertTitle>Saving details…</AlertTitle>
                    <AlertDescription>
                      {compatibleUntracked
                        ? 'Saving the Type across all records.'
                        : 'Saving your Type, amounts and Stock together.'}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-col gap-2">
                  <Button size="lg" disabled={saving} onClick={() => setSaving(true)}>
                    {saving ? 'Saving…' : 'Save details'}
                  </Button>
                  <Button variant="ghost" disabled={saving} onClick={() => setDiscard(true)}>
                    Cancel change
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
      <DiscardMedicineChanges
        open={discard}
        onOpenChange={setDiscard}
        onDiscard={() => {
          setDiscard(false)
          setCancelled(true)
        }}
      />
    </AppShell>
  )
}
