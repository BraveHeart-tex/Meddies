'use client'

import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { LastDayField, LastDayRow } from '@/features/schedules/last-day-controls'
import { magnesium, TODAY } from './lab-fixtures'

type LastDayProps = {
  value: string | null
  onChange: (next: string | null) => void
  min: string
  error?: string
  disabled?: boolean
}

/** The production Last day control each form uses: a field for set times, a row for every few hours. */
export function LastDayControl({
  kind,
  open,
  ...props
}: LastDayProps & { kind: 'times' | 'interval'; open?: boolean }) {
  return kind === 'times' ? (
    <LastDayField {...props} today={TODAY} />
  ) : (
    <LastDayRow {...props} today={TODAY} defaultOpen={open} />
  )
}

export type StopState = 'idle' | 'stopping' | 'unknown'

/** Stop schedule's confirm step: nothing saves until Stop schedule; the drawer holds while saving. */
export function StopScheduleDrawer({
  open: initiallyOpen = true,
  state = 'idle',
}: {
  open?: boolean
  state?: StopState
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const pending = state === 'stopping'
  return (
    <Drawer open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DrawerContent>
        <div className="-mt-2 flex flex-col gap-3" aria-busy={pending}>
          <DrawerHeader className="text-center">
            <DrawerTitle className="text-heading">Stop this schedule?</DrawerTitle>
          </DrawerHeader>
          <ul className="flex flex-col gap-2 text-body-sm text-muted-foreground">
            <li>Doses due so far, and any you&apos;ve logged, stay as they are.</li>
            <li>Meddies won&apos;t expect any more doses of {magnesium.label}.</li>
            <li>To start again, use Change schedule.</li>
          </ul>
          {state === 'unknown' && (
            <Alert variant="destructive">
              <AlertDescription>
                That might not have saved. Check your connection and try again.
              </AlertDescription>
            </Alert>
          )}
          <Button
            type="button"
            size="lg"
            variant="destructive"
            className="w-full"
            disabled={pending}
          >
            {pending ? 'Stopping…' : state === 'unknown' ? 'Retry' : 'Stop schedule'}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Keep schedule
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
