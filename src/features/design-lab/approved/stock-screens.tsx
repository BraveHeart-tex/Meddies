'use client'

import {
  Archive,
  CalendarDays,
  Clock,
  History,
  Package,
  PackageX,
  Pencil,
  Plus,
} from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { medicationRecordHref } from '@/features/medicines/routes'
import { ClockScheduleCard } from '@/features/schedules/clock-schedule-card'
import { ScheduleActions } from '@/features/schedules/schedule-actions'
import { SchedulingClockProvider } from '@/features/schedules/scheduling-clock'
import { LogDose } from '@/features/unscheduled-doses/log-dose'
import { unitName, type MedicineType } from '@/lib/quantity-policy'
import { FixtureQuery } from '../fixture-query'
import { NOW, TODAY } from '../lab-fixtures'
import {
  omega3,
  omega3Schedule,
  omega3Tracked,
  stockCopy,
  stockFixtures,
  stockParts,
} from './stock-model'

const iconClass = 'size-5 shrink-0 text-muted-foreground'
const plural = (unit: MedicineType) => unitName(null, unit)
const countOf = (medicine: Medicine) => (medicine.stock?.tracked ? medicine.stock.count : null)

/** Scrolls the reviewed part into view so the 402x874 capture shows it. */
function InView({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // jsdom has no scrollIntoView.
    ref.current?.scrollIntoView?.({ block: 'center' })
  }, [])
  return <div ref={ref}>{children}</div>
}

export function DetailFrame({ medicine, children }: { medicine: Medicine; children: ReactNode }) {
  return (
    <FixtureQuery {...stockFixtures(medicine)}>
      <SchedulingClockProvider serverNow={NOW}>
        <AppShell current="/medications">
          <ScreenStack>
            <div className="flex flex-col gap-5 [overflow-wrap:anywhere]">{children}</div>
          </ScreenStack>
        </AppShell>
      </SchedulingClockProvider>
    </FixtureQuery>
  )
}

function RowLink({
  label,
  href,
  description,
  icon,
}: {
  label: string
  href: string
  description?: string
  icon: ReactNode
}) {
  return (
    <Item variant="card" render={<MedicationsLink aria-label={label} href={href} />}>
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
        {description && <ItemDescription>{description}</ItemDescription>}
      </ItemContent>
      {icon}
    </Item>
  )
}

/** Medication details as 238·A3 shows it. */
function DetailsSection({ medicine }: { medicine: Medicine }) {
  return (
    <section className="flex flex-col gap-3" aria-label="Medication details">
      <h2 className="text-heading">Medication details</h2>
      <ItemGroup>
        <RowLink
          label="Edit details"
          href={medicationRecordHref(medicine.id, 'fix', 'lab')}
          description="Updates doses logged at the current strength."
          icon={<Pencil aria-hidden="true" className={iconClass} />}
        />
      </ItemGroup>
      <ItemGroup>
        <RowLink
          label="Change strength"
          href={medicationRecordHref(medicine.id, 'strength')}
          description="Earlier doses keep their saved strength."
          icon={<Clock aria-hidden="true" className={iconClass} />}
        />
        <RowLink
          label="Dose history"
          href={medicationRecordHref(medicine.id, 'doses')}
          icon={<CalendarDays aria-hidden="true" className={iconClass} />}
        />
        <RowLink
          label="Strength history"
          href={medicationRecordHref(medicine.id, 'history')}
          icon={<History aria-hidden="true" className={iconClass} />}
        />
      </ItemGroup>
    </section>
  )
}

/* 392·A1, A2 Stock card: a headed section under Log a dose. Off, one card says stock is not tracked
   and offers Track stock. On, the card sets the number in display type with its unit beside it,
   and Stop tracking sits quietly under the card. Record a refill (#48) and Change the count (#49)
   join as a row of buttons under the card; the low-stock notice (#52) joins the card under the
   count. */
function StockSection({ medicine }: { medicine: Medicine }) {
  const count = countOf(medicine)
  return (
    <section aria-labelledby="stock-heading" className="flex flex-col gap-3">
      <h2 id="stock-heading" className="text-heading">
        {stockCopy.heading}
      </h2>
      {count === null ? (
        <Item variant="card" className="flex-col items-stretch gap-3.5">
          <ItemContent>
            <ItemTitle>{stockCopy.offTitle}</ItemTitle>
            <ItemDescription>{stockCopy.offBody(plural(medicine.unit))}</ItemDescription>
          </ItemContent>
          <Button variant="outline" className="w-full" aria-haspopup="dialog">
            <Package aria-hidden="true" data-icon="inline-start" />
            {stockCopy.track}
          </Button>
        </Item>
      ) : (
        <>
          <Item variant="card">
            <ItemContent>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-display font-extrabold tabular-nums">
                  {stockParts(count, medicine.unit).number}
                </span>
                <span className="text-body-lg font-bold text-muted-foreground">
                  {stockParts(count, medicine.unit).unit} left
                </span>
              </p>
            </ItemContent>
          </Item>
          <Button variant="ghost" aria-haspopup="dialog">
            {stockCopy.stop}
          </Button>
        </>
      )}
    </section>
  )
}

/**
 * Medication detail (238·A3) for Omega-3. The Stock section sits under Log a dose; the drawer
 * frames show the page without it, behind the scrim.
 */
export function DetailBody({ medicine, stock }: { medicine: Medicine; stock: boolean }) {
  return (
    <>
      <MedicationBackRow href="/medications">Medications</MedicationBackRow>
      <MedicationIdentity medicine={medicine} />
      <section aria-label="Schedule" className="flex flex-col gap-3">
        <ClockScheduleCard schedule={omega3Schedule} unit={medicine.unit} today={TODAY} />
        <ScheduleActions
          medicine={medicine}
          schedule={omega3Schedule}
          ended={false}
          paused={false}
        />
      </section>
      <LogDose medicine={medicine} />
      {stock && (
        <InView>
          <StockSection medicine={medicine} />
        </InView>
      )}
      <DetailsSection medicine={medicine} />
      <Button variant="ghost" size="lg">
        <Archive data-icon="inline-start" />
        Archive medication
      </Button>
    </>
  )
}

export function StockDetailScreen({ tracked }: { tracked: boolean }) {
  const medicine = tracked ? omega3Tracked : omega3
  return (
    <DetailFrame medicine={medicine}>
      <DetailBody medicine={medicine} stock />
    </DetailFrame>
  )
}
