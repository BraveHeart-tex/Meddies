'use client'

import type { ReactNode, Ref } from 'react'
import { ChevronLeftIcon, Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Medicine } from './contract'
import { MedicationTile } from './medication-tile'
import { MedicationsLink } from './medications-nav'
import type { MedicinesRead } from './queries'
import { medicationsHref } from './routes'

/** The row above a sub-screen's identity: Back alone (238·A3). */
export function SubScreenRow({ children }: { children: ReactNode }) {
  return <header className="flex items-start [overflow-wrap:anywhere]">{children}</header>
}

/** Names where Back goes. Long names wrap and are never truncated or replaced by "Back". */
export function MedicationBackRow({ href, children }: { href: string; children: ReactNode }) {
  return (
    <SubScreenRow>
      <MedicationsLink
        href={href}
        className={cn(
          buttonVariants({ variant: 'ghost' }),
          '-ml-3 h-auto min-w-0 shrink justify-start py-2 text-left whitespace-normal',
        )}
      >
        <ChevronLeftIcon data-icon="inline-start" aria-hidden="true" className="shrink-0" />
        <span className="min-w-0">{children}</span>
      </MedicationsLink>
    </SubScreenRow>
  )
}

export const medicationsListHref = medicationsHref({ mode: 'list' })

/** Tile, name and "strength · unit". The name is the page heading on these views. */
export function MedicationIdentity({
  medicine,
  eyebrow,
  headingId,
  headingRef,
}: {
  medicine: Medicine
  eyebrow?: string
  headingId?: string
  headingRef?: Ref<HTMLHeadingElement>
}) {
  return (
    <div className="flex items-start gap-3 [overflow-wrap:anywhere]">
      <MedicationTile medicineId={medicine.id} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {eyebrow && (
          <p className="text-label font-extrabold tracking-eyebrow text-muted-foreground uppercase">
            {eyebrow}
          </p>
        )}
        {/* The margin keeps the Back row in view when a link scrolls to this heading. */}
        <h1
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="scroll-mt-16 text-title font-extrabold outline-none"
        >
          {medicine.label}
        </h1>
        <p className="text-body-sm font-bold text-muted-foreground">
          {[medicine.strength, medicine.unit].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  )
}

/** Medication not found. Nothing can be done with this medication, so only the way out is offered. */
export function MedicationNotFound() {
  return (
    <div className="flex flex-col gap-5">
      <Alert>
        <Info aria-hidden="true" />
        <AlertTitle>
          <h1 className="outline-none">This medication isn&apos;t in your list</h1>
        </AlertTitle>
        <AlertDescription>It may be a link from another account or an old link.</AlertDescription>
      </Alert>
      <MedicationsLink
        href={medicationsListHref}
        className={cn(buttonVariants({ variant: 'outline' }))}
      >
        Open Medications
      </MedicationsLink>
    </div>
  )
}

/** The medicines read failed with nothing cached, so which medication this is stays unknown. */
export function MedicationLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <h1 className="sr-only outline-none">Medication</h1>
      <Alert variant="destructive">
        <AlertTitle>This medication didn&apos;t load just now.</AlertTitle>
        <AlertDescription>Check your connection and try again.</AlertDescription>
        <Button variant="outline" className="mt-2 justify-self-start" onClick={onRetry}>
          Try loading medication again
        </Button>
      </Alert>
    </>
  )
}

/** The schedule read failed. The caller keeps Set schedule hidden: Meddies doesn't yet know there is no schedule. */
export function ScheduleUnchecked({ name, onRetry }: { name: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{name}&apos;s schedule couldn&apos;t be checked.</AlertTitle>
      <Button variant="outline" className="mt-2 justify-self-start" onClick={onRetry}>
        Retry
      </Button>
    </Alert>
  )
}

/** A refresh failed: the cached medications stay on screen with this recoverable notice. */
export function MedicinesRefreshAlert({
  medicinesRead: { refreshFailed, refreshing, retry },
}: {
  medicinesRead: MedicinesRead
}) {
  if (!refreshFailed) return null
  return (
    <Alert role="status">
      <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
        <p>Your medications didn&apos;t update just now. Showing the last list that loaded.</p>
        <Button variant="outline" className="min-h-11" disabled={refreshing} onClick={retry}>
          {refreshing ? 'Retrying…' : 'Try loading medications again'}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
