'use client'

import {
  Archive,
  CalendarCog,
  CalendarDays,
  CircleStop,
  Info,
  Package,
  PackageX,
  Pause,
  Pencil,
  ScrollText,
  SlidersHorizontal,
  Trash2,
  Weight,
  X,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { LoadingSection, Skeleton } from '@/components/ui/skeleton'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationBackRow, ScheduleUnchecked } from '@/features/medicines/medication-sub-screen'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { medicationRecordHref, medicationSetupHref } from '@/features/medicines/routes'
import { detailCopy, stateData, type DetailState, type StateData } from './medication-detail-model'
import {
  DetailFrame,
  DetailTop,
  IdentitySkeleton,
  InsetGroup,
  InsetRow,
  LogDoseButton,
  RefreshAlert,
  ScheduleFacts,
  ScheduleSummary,
  SlotNote,
  noop,
  scheduleView,
  stockValue,
} from './medication-detail-parts'

const canDelete = (medicine: Medicine) =>
  medicine.everHadSchedule === false && medicine.everHadDose === false

const manageHref = (medicine: Medicine) => `${medicationRecordHref(medicine.id)}&manage`

/** Log a dose: berry with no schedule, outline while Resume leads, soft otherwise (Ended too). */
function leadVariant(data: StateData) {
  if (!data.schedule && !data.scheduleError) return 'default' as const
  if (data.schedule && scheduleView(data.schedule).paused) return 'outline' as const
  return 'soft' as const
}

/** One Archived notice in place of the badge and the "Kept in History" alert. */
function ArchivedNotice() {
  return (
    <Alert>
      <Info aria-hidden="true" />
      <AlertTitle>{detailCopy.archivedTitle}</AlertTitle>
      <AlertDescription>{detailCopy.archivedBody}</AlertDescription>
    </Alert>
  )
}

/* The read-only schedule card with the next Clock dose; Resume is the only schedule action left
   on the summary. */
function ScheduleRead({ data }: { data: StateData }) {
  const { medicine, schedule } = data
  if (data.scheduleError) return <ScheduleUnchecked name={medicine.label} onRetry={noop} />
  if (!schedule)
    return (
      <Item variant="card">
        <ItemContent>
          <ItemTitle>No schedule</ItemTitle>
          <ItemDescription>Log a dose whenever you take one.</ItemDescription>
        </ItemContent>
      </Item>
    )
  const { paused } = scheduleView(schedule)
  return (
    <>
      <Card role="group" aria-label="Schedule">
        <CardHeader>
          <ScheduleSummary schedule={schedule} title />
        </CardHeader>
        <CardContent>
          <ScheduleFacts medicine={medicine} schedule={schedule} showNext />
        </CardContent>
      </Card>
      {paused && (
        <Button size="lg" className="w-full">
          Resume
        </Button>
      )}
    </>
  )
}

/**
 * 403 Direction B, Summary and Manage: the page reads the schedule, logs a dose and shows stock
 * and Dose history. The Stock row opens the stock Drawer (403·S1), or Track stock's turn-on
 * drawer while off; every other change is one row away on Manage (403·B14).
 */
export function DetailB({ state }: { state: DetailState }) {
  const data = stateData(state)
  const { medicine } = data
  if (state === 'archived')
    return (
      <DetailFrame data={data}>
        <DetailTop medicine={medicine} back="Archived medications" />
        <ArchivedNotice />
        <Button size="lg">Restore medication</Button>
        <InsetGroup>
          <InsetRow icon={Package} label="Stock" value={stockValue(medicine)} readOnly />
          <InsetRow
            icon={CalendarDays}
            label="Dose history"
            href={medicationRecordHref(medicine.id, 'doses')}
          />
          <InsetRow
            icon={ScrollText}
            label="Strength history"
            href={medicationRecordHref(medicine.id, 'history')}
          />
        </InsetGroup>
      </DetailFrame>
    )
  if (data.loading)
    return (
      <DetailFrame data={data}>
        <LoadingSection label="Loading medication" className="flex flex-col gap-5">
          <MedicationBackRow href="/medications">Medications</MedicationBackRow>
          <IdentitySkeleton />
          <Skeleton className="h-[268px] rounded-2xl" />
        </LoadingSection>
      </DetailFrame>
    )
  const slots = state === 'slots'
  return (
    <DetailFrame data={data}>
      <DetailTop medicine={medicine} />
      {data.refreshFailed && <RefreshAlert label={medicine.label} />}
      <ScheduleRead data={data} />
      <LogDoseButton variant={leadVariant(data)} />
      {!data.schedule && !data.scheduleError && (
        <MedicationsLink
          href={medicationSetupHref(medicine.id)}
          className={buttonVariants({ size: 'lg', variant: 'outline', className: 'w-full' })}
        >
          Set schedule
        </MedicationsLink>
      )}
      {data.saved && (
        <MedicationsLink
          href="/medications"
          className={buttonVariants({ size: 'lg', variant: 'outline' })}
        >
          Done for now
        </MedicationsLink>
      )}
      <InsetGroup
        note={
          slots ? 'Record a refill (#48) and Change the count (#49) open from Stock.' : undefined
        }
      >
        <InsetRow icon={Package} label="Stock" value={stockValue(medicine)} />
        {slots && <SlotNote inset issue={395} label="Days of stock left" />}
        {slots && <SlotNote inset issue={52} label="Low-stock warning" />}
        <InsetRow
          icon={CalendarDays}
          label="Dose history"
          href={medicationRecordHref(medicine.id, 'doses')}
        />
      </InsetGroup>
      <InsetGroup>
        <InsetRow
          icon={SlidersHorizontal}
          label={detailCopy.manage}
          description={detailCopy.manageHint}
          href={manageHref(medicine)}
        />
      </InsetGroup>
    </DetailFrame>
  )
}

/**
 * B's Manage sub-screen: Back names the medication; Schedule and Details groups, then Archive
 * and, when allowed, Delete at its end. Pause and Stop open their existing confirms here.
 */
export function ManageB({ state }: { state: DetailState }) {
  const data = stateData(state)
  const { medicine, schedule } = data
  const view = schedule ? scheduleView(schedule) : null
  return (
    <DetailFrame data={data}>
      <DetailTop medicine={medicine} back={medicine.label} eyebrow="Manage" />
      <InsetGroup title="Schedule">
        {!view?.paused && (
          <InsetRow
            icon={CalendarCog}
            label={schedule ? 'Change schedule' : 'Set schedule'}
            href={medicationSetupHref(medicine.id)}
          />
        )}
        {view?.running && <InsetRow icon={Pause} label="Pause" />}
        {view && !view.ended && (
          <InsetRow icon={CircleStop} label="Stop schedule" tone="destructive" />
        )}
        {state === 'slots' && <SlotNote inset issue={38} label="Food reminder" />}
      </InsetGroup>
      <InsetGroup title="Details">
        <InsetRow
          icon={Pencil}
          label="Edit details"
          description="Updates doses logged at the current strength."
          href={medicationRecordHref(medicine.id, 'fix', 'lab')}
        />
        <InsetRow
          icon={Weight}
          label="Change strength"
          description="Earlier doses keep their saved strength."
          href={medicationRecordHref(medicine.id, 'strength')}
        />
        <InsetRow
          icon={ScrollText}
          label="Strength history"
          href={medicationRecordHref(medicine.id, 'history')}
        />
      </InsetGroup>
      <div className="flex flex-col gap-2.5">
        <Button variant="ghost" size="lg">
          <Archive data-icon="inline-start" />
          Archive medication
        </Button>
        {canDelete(medicine) && (
          <Button variant="destructive" size="lg">
            <Trash2 data-icon="inline-start" />
            Delete medication
          </Button>
        )}
      </div>
    </DetailFrame>
  )
}

/* 403·S1 The stock Drawer the Stock row opens while stock is on: the count as its description,
   the places for Record a refill (#48) and Change the count (#49), and Stop tracking, which opens
   its existing confirm (392·S2). */
export function StockDrawerScreen() {
  const { medicine } = stateData('slots')
  return (
    <>
      <DetailB state="slots" />
      <Drawer open>
        <DrawerContent>
          <DrawerHeader>
            <div className="flex items-start justify-between gap-3">
              <DrawerTitle tabIndex={-1} className="outline-none">
                {`${medicine.label} stock`}
              </DrawerTitle>
              <DrawerClose render={<Button size="icon" variant="ghost" />} aria-label="Close">
                <X aria-hidden="true" />
              </DrawerClose>
            </div>
            <DrawerDescription>{stockValue(medicine)}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-3 pb-2">
            <SlotNote issue={48} label="Record a refill" />
            <SlotNote issue={49} label="Change the count" />
            <InsetGroup>
              <InsetRow icon={PackageX} label="Stop tracking" />
            </InsetGroup>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
