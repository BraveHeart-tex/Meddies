'use client'

import type { Ref } from 'react'
import { Archive, CalendarDays, Info, Package, ScrollText } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { isArchived, type Medicine } from './contract'
import {
  MedicationBackRow,
  MedicationIdentity,
  medicationsListHref,
  MedicinesRefreshAlert,
} from './medication-sub-screen'
import { MedicationInsetGroup, MedicationInsetRow } from './medication-inset-list'
import { stockCopy, stockRowValue } from './medicine-stock'
import { MedicationsLink } from './medications-nav'
import { MedicationsListSkeleton } from './medications-skeleton'
import type { MedicinesRead } from './queries'
import { archivedMedicationsHref, medicationRecordHref, medicationsHref } from './routes'

/**
 * The `?archived` view and its empty state (#330): the owner's Archived medicines, filtered from
 * the one medicines list. A failed refresh keeps the loaded list with Retry.
 */
export function ArchivedMedications({ medicinesRead }: { medicinesRead: MedicinesRead }) {
  const archived = medicinesRead.medicines.filter(isArchived)
  return (
    <div className="flex flex-col gap-5 [overflow-wrap:anywhere]">
      <MedicationBackRow href={medicationsListHref}>Medications</MedicationBackRow>
      <AppHeader title="Archived medications" />
      {medicinesRead.loadError ? (
        <Alert role="alert">
          <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
            <p>
              Your archived medications didn&apos;t load just now. Check your connection and try
              again.
            </p>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={medicinesRead.refreshing}
              onClick={medicinesRead.retry}
            >
              {medicinesRead.refreshing ? 'Retrying…' : 'Try again'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : medicinesRead.loading ? (
        <MedicationsListSkeleton />
      ) : (
        <>
          <MedicinesRefreshAlert medicinesRead={medicinesRead} />
          {archived.length === 0 ? (
            <EmptyState icon={Archive} title="No archived medications" />
          ) : (
            <>
              <ItemGroup>
                {archived.map((medicine) => (
                  <Item
                    key={medicine.id}
                    variant="card"
                    render={
                      <MedicationsLink
                        href={medicationsHref({ mode: 'detail', medicineId: medicine.id })}
                      />
                    }
                  >
                    <ItemContent>
                      <ItemTitle>{medicine.label}</ItemTitle>
                      <ItemDescription>
                        {[medicine.strength, medicine.unit, 'Archived'].filter(Boolean).join(' · ')}
                      </ItemDescription>
                    </ItemContent>
                    <Archive aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                  </Item>
                ))}
              </ItemGroup>
            </>
          )}
        </>
      )}
    </div>
  )
}

/** Approved with #403 Direction B: one notice in place of the Archived badge. */
const archivedCopy = {
  title: 'Archived',
  body: 'Kept in History. The schedule has stopped, reminders are cancelled and stock is unchanged.',
}

/**
 * An Archived medicine's read-only detail (#330; 238·A3, #407): Back to Archived
 * medications, one Archived notice, Restore medication (#328, 292·S8), then one inset group of the
 * read-only Stock row ("Not tracking" while off), Dose history and Strength history. No edit,
 * Archive, stock or new-dose action.
 */
export function ArchivedMedicationDetail({
  medicine,
  medicinesRead,
  headingRef,
  onRestoreRequested,
}: {
  medicine: Medicine
  medicinesRead: MedicinesRead
  headingRef?: Ref<HTMLHeadingElement>
  onRestoreRequested?: (medicine: Medicine) => void
}) {
  return (
    <div className="flex flex-col gap-5 [overflow-wrap:break-word]">
      <MedicationBackRow href={archivedMedicationsHref}>Archived medications</MedicationBackRow>
      <MedicationIdentity medicine={medicine} headingRef={headingRef} />
      <MedicinesRefreshAlert medicinesRead={medicinesRead} />
      <Alert>
        <Info aria-hidden="true" />
        <AlertTitle>{archivedCopy.title}</AlertTitle>
        <AlertDescription>{archivedCopy.body}</AlertDescription>
      </Alert>
      {typeof medicine.revision === 'number' && onRestoreRequested && (
        <Button
          id={`restore-medicine-${medicine.id}`}
          size="lg"
          onClick={() => onRestoreRequested(medicine)}
        >
          Restore medication
        </Button>
      )}
      <MedicationInsetGroup>
        <MedicationInsetRow
          icon={Package}
          label={stockCopy.heading}
          value={stockRowValue(medicine)}
        />
        <MedicationInsetRow
          icon={CalendarDays}
          label="Dose history"
          href={medicationRecordHref(medicine.id, 'doses')}
        />
        <MedicationInsetRow
          icon={ScrollText}
          label="Strength history"
          href={medicationRecordHref(medicine.id, 'history')}
        />
      </MedicationInsetGroup>
    </div>
  )
}
