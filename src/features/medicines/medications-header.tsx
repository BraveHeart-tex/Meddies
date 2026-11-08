'use client'

import { ChevronLeftIcon } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { buttonVariants } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useCachedQueryData } from '@/lib/use-cached-query-data'
import type { Medicine } from './contract'
import { MedicationsLink, useMedicationsView } from './medications-nav'
import { medicineKeys } from './queries'
import { medicationsHref } from './routes'

// A blank line holds the count's place so the rows below do not move when it arrives (647·L2).
const reservedCount = ' '

/**
 * The Medications title, count and Add, outside the streamed section: they appear first, stay put
 * and stay usable while the list loads. The cache is only watched, so this never starts a read.
 */
export function MedicationsHeader() {
  const view = useMedicationsView()
  const medicines = useCachedQueryData<Medicine[]>(medicineKeys.list())
  if (view.mode === 'add')
    return (
      <>
        <MedicationsLink
          href={medicationsHref({ mode: 'list' })}
          className={buttonVariants({ variant: 'ghost', className: '-ml-3 self-start' })}
        >
          <ChevronLeftIcon data-icon="inline-start" aria-hidden="true" />
          Medications
        </MedicationsLink>
        <AppHeader
          title="Add medication"
          subtitle="Saved once Meddies has it. You can set a schedule straight after, or later."
        />
      </>
    )
  if (view.mode !== 'list') return <AppHeader title="Medications" />
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
        // router and replaces it; the Add page reads nothing, so its form never waits.
        <MedicationsLink
          href={medicationsHref({ mode: 'add' })}
          routerNavigation={!medicines}
          aria-label="Add a medication"
          className={buttonVariants({ className: 'rounded-full' })}
        >
          <Icon name="plus" data-icon="inline-start" />
          Add
        </MedicationsLink>
      }
    />
  )
}
