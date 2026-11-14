'use client'

import type { ComponentProps } from 'react'
import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { saveMessages } from '@/lib/save-messages'
import type { SaveProblem } from '@/lib/session-saves'

export type ScheduleConfirmKind = 'stop' | 'pause'

const copy = {
  stop: {
    title: 'Stop this schedule?',
    lines: (label: string) => [
      "Doses due so far, and any you've logged, stay as they are.",
      `Meddies won't expect any more doses of ${label}.`,
      'To start again, use Change schedule.',
    ],
    confirm: 'Stop schedule',
    pending: 'Stopping…',
    variant: 'destructive',
  },
  pause: {
    title: 'Pause this schedule?',
    lines: (label: string) => [
      "Doses due so far, and any you've logged, stay as they are.",
      `Meddies won't expect any doses of ${label} until you resume.`,
      'Nothing is added later for the paused days.',
    ],
    confirm: 'Pause schedule',
    pending: 'Pausing…',
    variant: 'default',
  },
} as const

type ConfirmProps = {
  open: boolean
  label: string
  pending: boolean
  problem?: SaveProblem
  offline?: boolean
  onConfirm: () => void
  /** Keep schedule, swipe, backdrop and Escape. */
  onKeep: () => void
  /** Leaves a stale save for the current schedule. */
  onReview: () => void
  finalFocus?: ComponentProps<typeof DrawerContent>['finalFocus']
}

/**
 * Stop schedule's and Pause's confirm step (227·A15, S1, S2; 233·A3, S1, S2): nothing saves
 * until the confirm button. While saving it holds open with both buttons disabled; an unknown
 * result offers Retry of the same save, a stale one the 215·S2 recovery, and known offline
 * Connect to save.
 */
export function ScheduleConfirmDrawer({
  command,
  open,
  label,
  pending,
  problem,
  offline = false,
  onConfirm,
  onKeep,
  onReview,
  finalFocus,
}: ConfirmProps & { command: ScheduleConfirmKind }) {
  const text = copy[command]
  const problemId = `${command}-schedule-problem`
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
            <DrawerTitle className="text-heading">{text.title}</DrawerTitle>
          </DrawerHeader>
          <ul className="flex flex-col gap-2 text-body-sm text-muted-foreground">
            {text.lines(label).map((line) => (
              <li key={line}>{line}</li>
            ))}
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
                <Alert id={problemId}>
                  <InfoIcon aria-hidden="true" />
                  <AlertTitle>{saveMessages.offline}</AlertTitle>
                </Alert>
              ) : (
                problem === 'unconfirmed' && (
                  <Alert id={problemId} variant="destructive">
                    <AlertDescription>
                      That might not have saved. Check your connection and try again.
                    </AlertDescription>
                  </Alert>
                )
              )}
              <Button
                type="button"
                size="lg"
                variant={text.variant}
                className="w-full"
                disabled={pending || offline}
                aria-describedby={problem || offline ? problemId : undefined}
                onClick={onConfirm}
              >
                {pending
                  ? text.pending
                  : offline
                    ? saveMessages.connectToSave
                    : problem === 'unconfirmed'
                      ? 'Retry'
                      : text.confirm}
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
