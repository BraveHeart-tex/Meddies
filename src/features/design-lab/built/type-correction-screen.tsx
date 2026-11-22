'use client'

import { useState } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { SchedulingClockProvider } from '@/features/schedules/scheduling-clock'
import { DiscardMedicineChanges } from '@/features/medicines/discard-medicine-changes'
import {
  TypeCorrectionStock,
  TypeCorrectionSummary,
} from '@/features/medicines/type-correction-summary'
import { TypeCorrectionRepair } from '@/features/medicines/type-correction-repair'
import { FixtureQuery } from '../fixture-query'
import { NOW } from '../lab-fixtures'
import { repairMedicine, repairReview } from './type-correction-model'

const medicine = { ...repairMedicine, stock: { tracked: true as const, count: 18, threshold: 5 } }
const review = repairReview
const lastAmount = review.conflicts.length - 1

export function CorrectionFrame({ initial }: { initial: 'stock' | 'summary' | number }) {
  const [step, setStep] = useState(initial)
  const [discard, setDiscard] = useState(false)
  const [count, setCount] = useState(initial === 'summary' ? '16' : '')
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [checkingEntries, setCheckingEntries] = useState(false)
  const common = { medicine, review, onCancel: () => setDiscard(true) }
  const conflict = typeof step === 'number' ? review.conflicts[step] : null

  return (
    <FixtureQuery now={NOW}>
      <SchedulingClockProvider serverNow={NOW}>
        <AppShell current="/medications">
          {typeof step === 'number' && conflict && (
            <TypeCorrectionRepair
              {...common}
              key={conflict.key}
              index={step}
              value={amounts[conflict.key] ?? (typeof initial === 'number' ? '' : '1')}
              onValueChange={(value) => setAmounts({ ...amounts, [conflict.key]: value })}
              onBack={() => {
                if (step > 0) setStep(step - 1)
                else if (checkingEntries) setStep('summary')
              }}
              onContinue={() => {
                if (step < lastAmount) setStep(step + 1)
                else setStep(checkingEntries ? 'summary' : 'stock')
              }}
              onReturnToSummary={
                checkingEntries && step < lastAmount ? () => setStep('summary') : undefined
              }
              continueLabel={
                step < lastAmount
                  ? 'Continue'
                  : checkingEntries
                    ? 'Back to review'
                    : 'Continue to Stock'
              }
            />
          )}
          {step === 'stock' && (
            <TypeCorrectionStock
              {...common}
              value={count}
              onValueChange={setCount}
              onBack={() => setStep(lastAmount)}
              onContinue={() => setStep('summary')}
            />
          )}
          {step === 'summary' && (
            <TypeCorrectionSummary
              {...common}
              count={count}
              onSave={() => undefined}
              onBack={() => {
                setCheckingEntries(false)
                setStep('stock')
              }}
              onReviewAmounts={() => {
                setCheckingEntries(true)
                setStep(0)
              }}
            />
          )}
          <DiscardMedicineChanges
            open={discard}
            onOpenChange={setDiscard}
            onDiscard={() => {
              setDiscard(false)
              setCheckingEntries(false)
              setCount(initial === 'summary' ? '16' : '')
              setAmounts({})
              setStep(initial)
            }}
          />
        </AppShell>
      </SchedulingClockProvider>
    </FixtureQuery>
  )
}
