'use client'

import { Plus } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { buttonVariants } from '@/components/ui/button'
import { useCachedQueryData } from '@/lib/use-cached-query-data'
import type { Medicine } from './contract'
import { MedicationsLink, useMedicationsView } from './medications-nav'
import { medicineKeys } from './queries'
import { medicationsHref } from './routes'

// A blank line holds the count's place so the rows below do not move when it arrives (107·L2).
const reservedCount = ' '

/**
 * The Medications title, count and Add, outside the streamed section: they appear first, stay put
 * and stay usable while the list loads. The cache is only watched, so this never starts a read.
 */
export function MedicationsHeader() {
  const view = useMedicationsView()
  const medicines = useCachedQueryData<Medicine[]>(medicineKeys.list())
  // The medication page and setup have their own Back row and identity header (110 Fix 1).
  if (view.mode !== 'list' && view.mode !== 'add') return null
  return (
    <AppHeader
      title="Medications"
      subtitle={
        medicines?.length
          ? `${medicines.length} ${medicines.length === 1 ? 'medication' : 'medications'}`
          : reservedCount
      }
      action={
        // Before the list is cached the section may still be streaming, so Add goes through the
        // router and replaces it; Add's section reads nothing, so its Drawer never waits.
        <MedicationsLink
          href={medicationsHref({ mode: 'add' })}
          routerNavigation={!medicines}
          keepScroll
          aria-label="Add a medication"
          // The empty state's Add medication is the view's one primary action.
          className={buttonVariants({
            variant: medicines?.length === 0 ? 'soft' : 'default',
            className: 'rounded-full',
          })}
        >
          <Plus aria-hidden="true" data-icon="inline-start" />
          Add
        </MedicationsLink>
      }
    />
  )
}
