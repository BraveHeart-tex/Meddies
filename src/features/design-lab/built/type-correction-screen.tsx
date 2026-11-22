'use client'

import { useState } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { SchedulingClockProvider } from '@/features/schedules/scheduling-clock'
import { DiscardMedicineChanges } from '@/features/medicines/discard-medicine-changes'
import { TypeCorrectionRepair } from '@/features/medicines/type-correction-repair'
import { FixtureQuery } from '../fixture-query'
import { NOW } from '../lab-fixtures'
import { repairMedicine, repairReview } from './type-correction-model'

export function RepairFrame({ schedule = false }: { schedule?: boolean }) {
  const [discard, setDiscard] = useState(false)
  const [index, setIndex] = useState(schedule ? 25 : 0)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const key = repairReview.conflicts[index].key
  return (
    <FixtureQuery now={NOW}>
      <SchedulingClockProvider serverNow={NOW}>
        <AppShell current="/medications">
          <TypeCorrectionRepair
            key={key}
            medicine={repairMedicine}
            review={repairReview}
            index={index}
            value={amounts[key] ?? ''}
            onValueChange={(value) => setAmounts({ ...amounts, [key]: value })}
            onBack={() => setIndex(Math.max(0, index - 1))}
            onContinue={() => setIndex(index + 1)}
            onCancel={() => setDiscard(true)}
          />
          <DiscardMedicineChanges
            open={discard}
            onOpenChange={setDiscard}
            onDiscard={() => {
              setAmounts({})
              setDiscard(false)
              setIndex(0)
            }}
          />
        </AppShell>
      </SchedulingClockProvider>
    </FixtureQuery>
  )
}
