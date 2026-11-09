'use client'

import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { saveMessages } from '@/lib/save-messages'
import type { SaveProblem } from '@/lib/session-saves'

/** The save problem or offline notice above the setup forms' one primary action. */
export function ScheduleSaveFooter({
  problem,
  offline,
  isSubmitting,
  label,
  checkHint,
}: {
  problem?: SaveProblem
  offline: boolean
  isSubmitting: boolean
  label: string
  /** What to check after a rejected save, in that form's own words. */
  checkHint: string
}) {
  return (
    <>
      {offline && !isSubmitting ? (
        <Alert id="schedule-save-problem">
          <InfoIcon aria-hidden="true" />
          <AlertTitle>{saveMessages.offline}</AlertTitle>
          <AlertDescription>{saveMessages.offlineFormDetails}</AlertDescription>
        </Alert>
      ) : problem ? (
        <SaveProblemAlert problem={problem} label={label} checkHint={checkHint} />
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting || offline}
        className="w-full whitespace-normal"
        aria-describedby={problem || offline ? 'schedule-save-problem' : undefined}
      >
        {isSubmitting
          ? 'Saving schedule...'
          : offline
            ? saveMessages.connectToSave
            : problem === 'unconfirmed'
              ? 'Try saving schedule again'
              : 'Save schedule'}
      </Button>
    </>
  )
}

function SaveProblemAlert({
  problem,
  label,
  checkHint,
}: {
  problem: SaveProblem
  label: string
  checkHint: string
}) {
  const copy = {
    unconfirmed: {
      title: saveMessages.mightNotHaveSaved,
      body: `${label} is saved. Its schedule details are still here, and trying again saves them only once.`,
    },
    rejected: {
      title: "Schedule wasn't saved.",
      body: `${label} is saved without a schedule. ${checkHint}`,
    },
    conflict: { title: 'A schedule is already saved.', body: 'Open Medications to review it.' },
  }[problem]
  return (
    <Alert id="schedule-save-problem" variant="destructive">
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{copy.body}</AlertDescription>
    </Alert>
  )
}
