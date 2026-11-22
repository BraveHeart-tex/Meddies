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
  quantityLabel,
  quantityRule,
  unitName,
  type WritableMedicineType,
} from '@/lib/quantity-policy'
import { TypeCorrectionRepair } from './type-correction-repair'
import { TypeTile } from './type-tile'
import { MedicationIdentity } from './medication-sub-screen'
import type { MedicineRecord } from './contract'
import { parseTypeCorrectionReview } from './type-correction-contract'

/** Advisory read only. Entry values stay in the record form's Session draft. A fresh entry or
 * explicit retry reads again. Conflicts open the guided repair queue; no save, Stock count
 * or automatic continuation is started.
 */
export function TypeCorrectionReviewScreen({
  medicine,
  unit,
  onBack,
  onCancel,
  amounts,
  onAmountChange,
}: {
  medicine: MedicineRecord
  unit: WritableMedicineType
  onBack: () => void
  onCancel: () => void
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
    staleTime: 0,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const [index, setIndex] = useState<number | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [read.status, index])
  const review = read.data
  const type = medicineTypeLabel(unit)
  const count = review?.conflicts.length ?? 0
  const doses = review?.conflicts.filter((item) => item.kind !== 'schedule').length ?? 0
  const schedules = count - doses
  const destination = count ? 'repair' : review?.stockTracked ? 'stock' : 'review'
  const oldUnit = review?.fromUnit ?? medicine.unit
  const change = (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-body-lg font-extrabold">
      <span className="inline-flex items-center gap-2">
        <TypeTile type={oldUnit} />
        {medicineTypeLabel(oldUnit)}
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">to</span>
      <span className="inline-flex items-center gap-2">
        <TypeTile type={unit} />
        {type}
      </span>
    </span>
  )
  if (review && index !== null)
    return (
      <TypeCorrectionRepair
        key={review.conflicts[index].key}
        medicine={medicine}
        review={review}
        index={index}
        value={amounts[review.conflicts[index].key] ?? ''}
        onValueChange={(value) => onAmountChange(review.conflicts[index].key, value)}
        onBack={() => setIndex(index === 0 ? null : index - 1)}
        onContinue={() => setIndex(index + 1)}
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
      {review && count > 0 && (
        <Button size="lg" onClick={() => setIndex(0)}>
          Check first amount
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      )}
      <Button variant={review ? 'ghost' : 'outline'} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
