'use client'

import { CalendarDays, Info, Package, ScrollText, SlidersHorizontal } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { stockRowValue } from '@/features/medicines/medicine-stock'
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
  scheduleView,
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
 * and Dose history. The Stock row opens the stock Drawer, or Track stock's turn-on drawer while
 * off (both built in 238·A3); every other change is one row away on Manage (403·B14).
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
          <InsetRow icon={Package} label="Stock" value={stockRowValue(medicine)} readOnly />
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
      <InsetGroup>
        <InsetRow icon={Package} label="Stock" value={stockRowValue(medicine)} />
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
