'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { PrivateReadError } from '@/lib/session-check'
import {
  medicineTypeLabel,
  parseQuantity,
  quantityLabel,
  quantityProblem,
  quantityRule,
  unitName,
  type WritableMedicineType,
} from '@/lib/quantity-policy'
import { TypeCorrectionRepair } from './type-correction-repair'
import {
  CorrectionTypeChange,
  TypeCorrectionStock,
  TypeCorrectionSummary,
} from './type-correction-summary'
import { MedicationIdentity } from './medication-sub-screen'
import type { MedicineRecord } from './contract'
import type { TypeCorrection } from './type-correction-contract'
import type { useTypeCorrectionSave } from './use-type-correction-save'
import { parseTypeCorrectionReview } from './type-correction-contract'

/** Advisory read only. Entry values stay in the record form's Session draft. A fresh entry or
 * explicit retry reads again. Repairs and a fresh Stock count feed final review without writing.
 */
export function TypeCorrectionReviewScreen({
  medicine,
  resumed,
  correction,
  details,
  expectedRevision,
  onReviewSaved,
  unit,
  onBack,
  onCancel,
  amounts,
  onAmountChange,
  stockCount,
  onStockCountChange,
}: {
  medicine: MedicineRecord
  resumed: ReturnType<typeof useTypeCorrectionSave>['submitted']
  correction: ReturnType<typeof useTypeCorrectionSave>
  expectedRevision: number
  details: NonNullable<TypeCorrection['details']>
  onReviewSaved: () => Promise<void>
  unit: WritableMedicineType
  onBack: () => void
  onCancel: () => void
  stockCount: string
  onStockCountChange: (value: string) => void
  amounts: Record<string, string>
  onAmountChange: (key: string, value: string) => void
}) {
  const read = useQuery({
    queryKey: ['medicine-type-correction', medicine.id, unit],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/medicines/type-correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medicineId: medicine.id, unit }),
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      })
      if (!response.ok) throw new PrivateReadError(response.status)
      const data = (await response.json()) as { review: unknown }
      const review = parseTypeCorrectionReview(data.review)
      if (review.medicineId !== medicine.id || review.unit !== unit)
        throw new Error('Review does not match chosen Type')
      return review
    },
    enabled: !resumed,
    staleTime: 0,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const [step, setStep] = useState<'consequences' | 'stock' | 'summary' | number>(
    resumed ? 'summary' : 'consequences',
  )
  const [checkingEntries, setCheckingEntries] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [read.status, step])
  const review = resumed?.review ?? read.data
  const type = medicineTypeLabel(unit)
  const count = review?.conflicts.length ?? 0
  const doses = review?.conflicts.filter((item) => item.kind !== 'schedule').length ?? 0
  const schedules = count - doses
  const destination = count ? 'repair' : review?.stockTracked ? 'stock' : 'review'
  const oldUnit = review?.fromUnit ?? medicine.unit
  const change = <CorrectionTypeChange from={oldUnit} to={unit} />
  const lastAmount = count - 1
  const afterRepairs = review?.stockTracked ? 'stock' : 'summary'
  function returnToSummary() {
    if (!review) return
    const invalid = review.conflicts.findIndex(({ key }) =>
      quantityProblem(amounts[key] ?? '', unit),
    )
    setStep(invalid === -1 ? 'summary' : invalid)
  }
  if (review && typeof step === 'number')
    return (
      <TypeCorrectionRepair
        key={review.conflicts[step].key}
        medicine={medicine}
        review={review}
        index={step}
        value={amounts[review.conflicts[step].key] ?? ''}
        onValueChange={(value) => onAmountChange(review.conflicts[step].key, value)}
        onBack={() => {
          if (step > 0) setStep(step - 1)
          else if (checkingEntries) returnToSummary()
          else setStep('consequences')
        }}
        onContinue={() => {
          if (step < lastAmount) setStep(step + 1)
          else if (checkingEntries) returnToSummary()
          else setStep(afterRepairs)
        }}
        continueLabel={
          step < lastAmount
            ? 'Continue'
            : checkingEntries
              ? 'Back to review'
              : review.stockTracked
                ? 'Continue to Stock'
                : 'Review changes'
        }
        onReturnToSummary={checkingEntries && step < lastAmount ? returnToSummary : undefined}
        onCancel={onCancel}
      />
    )
  if (review && step === 'stock')
    return (
      <TypeCorrectionStock
        medicine={medicine}
        review={review}
        value={stockCount}
        onValueChange={onStockCountChange}
        onContinue={() => setStep('summary')}
        onBack={() => setStep(count ? lastAmount : 'consequences')}
        onCancel={onCancel}
      />
    )
  if (review && step === 'summary')
    return (
      <TypeCorrectionSummary
        medicine={resumed?.medicine ?? medicine}
        review={review}
        count={stockCount}
        pending={correction.pending}
        problem={correction.problem}
        onReviewSaved={onReviewSaved}
        onSave={() => {
          if (correction.problem === 'unconfirmed') {
            void correction.retry()
            return
          }
          const repairs = review.conflicts.map(({ key }) => ({
            key,
            quantity: parseQuantity(amounts[key] ?? ''),
          }))
          if (repairs.some(({ quantity }) => quantity === null)) {
            returnToSummary()
            return
          }
          void correction.submit({
            medicine,
            review,
            command: {
              medicineId: medicine.id,
              expectedRevision,
              reviewVersion: review.reviewVersion,
              unit,
              stockCount: review.stockTracked ? parseQuantity(stockCount) : null,
              repairs: repairs.map(({ key, quantity }) => ({ key, quantity: quantity! })),
              details,
            },
          })
        }}
        onReviewAmounts={() => {
          setCheckingEntries(true)
          setStep(0)
        }}
        onBack={() => {
          setCheckingEntries(false)
          setStep(review.stockTracked ? 'stock' : count ? lastAmount : 'consequences')
        }}
        onCancel={onCancel}
      />
    )
  return (
    <div className={review ? 'flex flex-col gap-7 pb-5' : 'flex flex-col gap-5 pb-5'}>
      <Button variant="ghost" className="-ml-3 self-start" onClick={onBack}>
        <ChevronLeft data-icon="inline-start" aria-hidden="true" />
        Edit details
      </Button>
      {review ? (
        <header className="flex flex-col gap-3">
          <p className="text-body-sm font-bold text-muted-foreground">
            {medicine.label}
            {medicine.strength ? ` · ${medicine.strength}` : ''}
          </p>
          <h1 ref={heading} tabIndex={-1} className="text-title font-extrabold outline-none">
            Change to {type}?
          </h1>
        </header>
      ) : (
        <>
          <MedicationIdentity medicine={medicine} />
          <h2 ref={heading} tabIndex={-1} className="text-heading outline-none">
            Review Type change
          </h2>
        </>
      )}
      {review ? (
        <div className="flex flex-col gap-3">
          <Card className="gap-3 px-4">
            {change}
            <div className="border-t pt-3">
              <h2 className="text-body-sm font-extrabold">
                Applies to all {medicine.label} records
              </h2>
              <p className="text-body-sm text-muted-foreground">
                Every strength period, dose and schedule.
              </p>
            </div>
          </Card>
          <Card className="gap-0 px-4 py-0">
            <div className="flex flex-col gap-1 py-3">
              <h2 className="text-body-sm font-extrabold">Compatible amounts keep their number</h2>
              <p className="text-body-sm text-muted-foreground">
                {quantityLabel(1, oldUnit)} is recorded as {quantityLabel(1, unit)}.
              </p>
              <p className="text-body-sm text-muted-foreground">
                {review.compatibleAmounts} compatible{' '}
                {review.compatibleAmounts === 1 ? 'amount keeps its' : 'amounts keep their'} number.
              </p>
            </div>
            <div className="flex flex-col gap-1 border-t py-3">
              <h2 className="text-body-sm font-extrabold">
                {count
                  ? `${count} ${count === 1 ? 'amount' : 'amounts'} to check`
                  : 'All saved amounts fit'}
              </h2>
              <p className="text-body-sm text-muted-foreground">
                {destination === 'repair'
                  ? `Enter ${quantityRule(unit).step === 1 ? 'a whole number' : `a valid ${unitName(1, unit)} amount`} for each of ${doses} ${doses === 1 ? 'dose' : 'doses'} and ${schedules} schedule ${schedules === 1 ? 'amount' : 'amounts'}.${review.stockTracked ? ` Then count your ${unitName(2, unit)}.` : ' Stock tracking stays off.'}`
                  : destination === 'stock'
                    ? `Next, count your ${unitName(2, unit)}.`
                    : 'Stock tracking stays off.'}
              </p>
            </div>
          </Card>
          <p className="px-1 text-caption text-muted-foreground">
            Name and strength changes apply only to this period and its doses. Nothing is saved yet.
          </p>
        </div>
      ) : (
        <>
          <Card className="gap-2 px-4">
            <h3 className="text-body-sm font-extrabold">Your chosen Type</h3>
            {change}
          </Card>
          {read.isError ? (
            <>
              <Alert variant="destructive">
                <AlertTitle>Couldn’t load the review.</AlertTitle>
                <AlertDescription>
                  Your entered details are still here. All doses and saved schedules must be checked
                  before saving.
                </AlertDescription>
              </Alert>
              <Button size="lg" disabled={read.isFetching} onClick={() => void read.refetch()}>
                Try loading again
              </Button>
            </>
          ) : (
            <p role="status" className="text-body-sm text-muted-foreground">
              Loading the review...
            </p>
          )}
        </>
      )}
      {review && (
        <Button size="lg" onClick={() => setStep(count ? 0 : afterRepairs)}>
          {count
            ? 'Check first amount'
            : review.stockTracked
              ? 'Continue to Stock'
              : 'Review changes'}
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      )}
      <Button variant={review ? 'ghost' : 'outline'} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
