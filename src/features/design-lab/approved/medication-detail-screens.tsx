'use client'

import {
  CalendarDays,
  Info,
  Package,
  PackageX,
  ScrollText,
  SlidersHorizontal,
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
import { MedicationsLink } from '@/features/medicines/medications-nav'
import {
  medicationManageHref,
  medicationRecordHref,
  medicationSetupHref,
} from '@/features/medicines/routes'
import { detailCopy, stateData, type DetailState, type StateData } from './medication-detail-model'
import {
  DetailFrame,
  DetailTop,
  InsetGroup,
  InsetRow,
  LogDoseButton,
  ScheduleFacts,
  ScheduleSummary,
  SlotNote,
  scheduleView,
  stockValue,
} from './medication-detail-parts'

/** Log a dose: berry with no schedule, outline while Resume leads, soft otherwise (Ended too). */
function leadVariant(data: StateData) {
  if (!data.schedule) return 'default' as const
  if (scheduleView(data.schedule).paused) return 'outline' as const
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
          <ScheduleFacts medicine={medicine} schedule={schedule} />
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
  const slots = state === 'slots'
  return (
    <DetailFrame data={data}>
      <DetailTop medicine={medicine} />
      <ScheduleRead data={data} />
      <LogDoseButton variant={leadVariant(data)} />
      {!data.schedule && (
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
          href={medicationManageHref(medicine.id)}
        />
      </InsetGroup>
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
