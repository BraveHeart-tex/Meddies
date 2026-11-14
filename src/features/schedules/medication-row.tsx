'use client'

import type { Ref } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationTile } from '@/features/medicines/medication-tile'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { medicationsHref } from '@/features/medicines/routes'
import { PausedBadge } from './clock-schedule-card'

/**
 * One Medications row. `scheduleSummary` is null when the medication has no schedule; a paused
 * one adds the Paused Badge and says so in the row link's name.
 */
export function MedicationRow({
  medicine,
  scheduleSummary,
  paused = false,
  linkRef,
}: {
  medicine: Medicine
  scheduleSummary: string | null
  paused?: boolean
  linkRef?: Ref<HTMLAnchorElement>
}) {
  return (
    <Item
      render={<li />}
      variant="card"
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
        {/* No schedule is a complete record for occasional use, not unfinished setup (#275). */}
        {paused && <PausedBadge />}
        <p className="text-label font-bold">{scheduleSummary ?? 'No schedule'}</p>
      </ItemContent>
      <ChevronRightIcon aria-hidden="true" className="text-muted-foreground" />
      <MedicationsLink
        ref={linkRef}
        data-row-link
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        href={medicationsHref({ mode: 'detail', medicineId: medicine.id })}
        aria-label={`View details for ${medicine.label}${paused ? ', Paused' : ''}`}
      >
        <span className="sr-only">View details</span>
      </MedicationsLink>
    </Item>
  )
}
