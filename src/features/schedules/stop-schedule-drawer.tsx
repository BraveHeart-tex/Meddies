'use client'

import type { ComponentProps } from 'react'
import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { saveMessages } from '@/lib/save-messages'
import type { SaveProblem } from '@/lib/session-saves'

/**
 * Stop schedule's confirm step (227·A15, S1, S2): nothing saves until Stop schedule. While
 * stopping it holds open with both buttons disabled; an unknown result offers Retry of the same
 * stop, and a stale one the 215·S2 recovery.
 */
export function StopScheduleDrawer({
  open,
  label,
  pending,
  problem,
  offline = false,
  onStop,
  onKeep,
  onReview,
  finalFocus,
}: {
  open: boolean
  label: string
  pending: boolean
  problem?: SaveProblem
  offline?: boolean
  onStop: () => void
  /** Keep schedule, swipe, backdrop and Escape. */
  onKeep: () => void
  /** Leaves a stale stop for the current schedule. */
  onReview: () => void
  finalFocus?: ComponentProps<typeof DrawerContent>['finalFocus']
}) {
  const stale = problem === 'conflict'
  return (
    <Drawer
      open={open}
      disablePointerDismissal={pending}
      onOpenChange={(next, eventDetails) => {
        if (next) return
        if (pending) eventDetails.cancel()
        else onKeep()
      }}
    >
      <DrawerContent finalFocus={finalFocus}>
        <div className="-mt-2 flex flex-col gap-3" aria-busy={pending}>
          <DrawerHeader className="text-center">
            <DrawerTitle className="text-heading">Stop this schedule?</DrawerTitle>
          </DrawerHeader>
          <ul className="flex flex-col gap-2 text-body-sm text-muted-foreground">
            <li>Doses due so far, and any you&apos;ve logged, stay as they are.</li>
            <li>Meddies won&apos;t expect any more doses of {label}.</li>
            <li>To start again, use Change schedule.</li>
          </ul>
          {stale ? (
            <>
              <Alert variant="destructive">
                <AlertTitle>This schedule changed while you were editing.</AlertTitle>
                <AlertDescription>
                  Nothing here was saved. Review the current schedule, then make your change again.
                </AlertDescription>
              </Alert>
              <Button type="button" size="lg" className="w-full" onClick={onReview}>
                Review current schedule
              </Button>
            </>
          ) : (
            <>
              {offline && !pending ? (
                <Alert id="stop-schedule-problem">
                  <InfoIcon aria-hidden="true" />
                  <AlertTitle>{saveMessages.offline}</AlertTitle>
                </Alert>
              ) : (
                problem === 'unconfirmed' && (
                  <Alert id="stop-schedule-problem" variant="destructive">
                    <AlertDescription>
                      That might not have saved. Check your connection and try again.
                    </AlertDescription>
                  </Alert>
                )
              )}
              <Button
                type="button"
                size="lg"
                variant="destructive"
                className="w-full"
                disabled={pending || offline}
                aria-describedby={problem || offline ? 'stop-schedule-problem' : undefined}
                onClick={onStop}
              >
                {pending
                  ? 'Stopping…'
                  : offline
                    ? saveMessages.connectToSave
                    : problem === 'unconfirmed'
                      ? 'Retry'
                      : 'Stop schedule'}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-full"
                disabled={pending}
                onClick={onKeep}
              >
                Keep schedule
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
