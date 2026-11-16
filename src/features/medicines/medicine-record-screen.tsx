'use client'

import { Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { strengthPeriodDescription } from './strength-period'
import type { MedicinesRead } from './queries'
import { isArchived, parseMedicineRecord, type MedicineRecord } from './contract'
import {
  MedicationBackRow,
  MedicationIdentity,
  MedicationLoadFailed,
  MedicationNotFound,
  MedicinesRefreshAlert,
} from './medication-sub-screen'
import { MedicationDetailSkeleton } from './medications-skeleton'
import { MedicationsLink, returnToMedicationPage } from './medications-nav'
import { medicationRecordHref } from './routes'
import { MedicineRecordForm } from './medicine-record-form'

/** Record views use the same private list read as detail; missing metadata never unlocks edits. */
export function MedicineRecordScreen({
  medicinesRead,
  medicineId,
  record,
  periodId,
  today,
  onSaved,
}: {
  medicinesRead: MedicinesRead
  medicineId: string
  record: 'fix' | 'strength' | 'history'
  periodId?: string
  today: string
  onSaved: (medicine: MedicineRecord, kind: 'fix' | 'strength') => void
}) {
  // An Archived medicine keeps its read-only Strength history, never its edits.
  const medicine = medicinesRead.medicines.find(
    (item) => item.id === medicineId && (record === 'history' || !isArchived(item)),
  )
  let body
  if (medicinesRead.loading) body = <MedicationDetailSkeleton />
  else if (medicinesRead.loadError) body = <MedicationLoadFailed onRetry={medicinesRead.retry} />
  else if (!medicine) body = <MedicationNotFound />
  else {
    let saved: MedicineRecord | undefined
    try {
      saved = parseMedicineRecord(medicine)
    } catch {
      /* Old Worker overlap cannot safely edit. */
    }
    if (!saved) body = <MedicationLoadFailed onRetry={medicinesRead.retry} />
    else if (record === 'history')
      body = (
        <>
          <MedicationIdentity medicine={saved} />
          <div className="flex flex-col gap-2">
            <h2 className="text-heading">Strength history</h2>
            <p className="text-body-sm text-muted-foreground">
              Editing a period updates the doses logged in it. Changing strength starts a new
              period.
            </p>
          </div>
          <ItemGroup>
            {[...saved.strengthRevisions].reverse().map((period) => (
              <Item key={period.id} variant="card">
                <ItemContent>
                  <div className="flex flex-wrap items-center gap-2">
                    <ItemTitle>{period.strength ?? 'No strength entered'}</ItemTitle>
                    {period.id === saved.currentStrengthRevisionId && (
                      <Badge variant="secondary">Current</Badge>
                    )}
                  </div>
                  <ItemDescription>
                    {strengthPeriodDescription(saved.strengthRevisions, period.id, today)}
                  </ItemDescription>
                </ItemContent>
                <ItemFooter>
                  <MedicationsLink
                    href={medicationRecordHref(saved.id, 'fix', period.id)}
                    className={buttonVariants({ variant: 'outline', className: 'w-full' })}
                  >
                    <Pencil data-icon="inline-start" aria-hidden="true" />
                    Edit details for this period
                  </MedicationsLink>
                </ItemFooter>
              </Item>
            ))}
          </ItemGroup>
        </>
      )
    else {
      const period = periodId ?? saved.currentStrengthRevisionId
      if (!saved.strengthRevisions.some((row) => row.id === period)) body = <MedicationNotFound />
      else
        body = (
          <>
            <MedicineRecordForm
              key={`${saved.id}:${record}:${record === 'strength' ? '-' : period}`}
              medicine={saved}
              mode={record}
              periodId={period}
              onSaved={(value) => {
                onSaved(value, record)
              }}
              onCancel={() => returnToMedicationPage(saved.id)}
            />
          </>
        )
    }
  }
  // A history -> period edit retains its original medication entry. Native navigation keeps
  // this metadata across reload, so completing the edit consumes both subviews with one Back.
  return (
    <div className="flex flex-col gap-5">
      {!medicinesRead.loading && (record === 'history' || !medicine) && (
        <MedicationBackRow href={medicationRecordHref(medicineId)}>
          {medicine?.label ?? 'Medication'}
        </MedicationBackRow>
      )}
      <MedicinesRefreshAlert medicinesRead={medicinesRead} />
      {body}
    </div>
  )
}
