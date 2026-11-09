'use client'

import type { Ref } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationTile } from '@/features/medicines/medication-tile'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { medicationSetupHref, medicationsHref } from '@/features/medicines/routes'

/** One Medications row. `scheduleSummary` is null when the medication has no schedule. */
export function MedicationRow({
  medicine,
  scheduleSummary,
  linkRef,
}: {
  medicine: Medicine
  scheduleSummary: string | null
  linkRef?: Ref<HTMLAnchorElement>
}) {
  return (
    <Item
      render={<li />}
      variant={scheduleSummary ? 'card' : 'dashed'}
      className="p-3.5 [&>svg]:size-5 has-[[data-row-link]:active]:scale-[0.98] has-[[data-row-link]:active]:bg-muted motion-reduce:has-[[data-row-link]:active]:scale-100"
    >
      <MedicationTile medicineId={medicine.id} />
      <ItemContent className="gap-0.75">
        <ItemTitle>
          <h4>{medicine.label}</h4>
        </ItemTitle>
        <ItemDescription>
          {[medicine.strength, medicine.unit].filter(Boolean).join(' · ')}
        </ItemDescription>
        {scheduleSummary ? (
          <p className="text-label font-bold">{scheduleSummary}</p>
        ) : (
          <>
            <p className="text-label font-semibold text-muted-foreground">No schedule yet.</p>
            <MedicationsLink
              href={medicationSetupHref(medicine.id)}
              aria-label={`Set schedule for ${medicine.label}`}
              className={buttonVariants({
                variant: 'soft',
                size: 'sm',
                className: 'relative z-1 mt-1.5 self-start',
              })}
            >
              Set schedule
            </MedicationsLink>
          </>
        )}
      </ItemContent>
      <ChevronRightIcon aria-hidden="true" className="text-muted-foreground" />
      <MedicationsLink
        ref={linkRef}
        data-row-link
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        href={medicationsHref({ mode: 'detail', medicineId: medicine.id })}
        aria-label={`View details for ${medicine.label}`}
      >
        <span className="sr-only">View details</span>
      </MedicationsLink>
    </Item>
  )
}
