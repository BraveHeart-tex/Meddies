'use client'

import { InfoIcon } from 'lucide-react'
import { StickyActions } from '@/components/layout/sticky-actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { saveMessages } from '@/lib/save-messages'
import type { SaveProblem } from '@/lib/session-saves'

/** A change to the current Schedule version: whether anything differs, and the conflict exit. */
export type ScheduleChangeFooter = {
  changed: boolean
  /** Leaves for the current Schedule version after another save got there first (215·S2). */
  onReview: () => void
}

/**
 * The save problem or offline notice above the setup forms' one primary action, pinned to the
 * bottom (215·A2). A `change` saves changes to the current Schedule version instead.
 */
export function ScheduleSaveFooter({
  problem,
  offline,
  isSubmitting,
  label,
  checkHint,
  change,
}: {
  problem?: SaveProblem
  offline: boolean
  isSubmitting: boolean
  label: string
  /** What to check after a rejected save, in that form's own words. */
  checkHint: string
  change?: ScheduleChangeFooter
}) {
  if (change && problem === 'conflict')
    return (
      <StickyActions>
        <Alert id="schedule-save-problem" variant="destructive">
          <AlertTitle>This schedule changed while you were editing.</AlertTitle>
          <AlertDescription>
            Nothing here was saved. Review the current schedule, then make your change again.
          </AlertDescription>
        </Alert>
        <Button
          type="button"
          size="lg"
          className="w-full whitespace-normal"
          onClick={change.onReview}
        >
          Review current schedule
        </Button>
      </StickyActions>
    )
  const words = change
    ? { saving: 'Saving changes...', retry: 'Try saving changes again', save: 'Save changes' }
    : { saving: 'Saving schedule...', retry: 'Try saving schedule again', save: 'Save schedule' }
  return (
    <StickyActions>
      {offline && !isSubmitting ? (
        <Alert id="schedule-save-problem">
          <InfoIcon aria-hidden="true" />
          <AlertTitle>{saveMessages.offline}</AlertTitle>
          <AlertDescription>{saveMessages.offlineFormDetails}</AlertDescription>
        </Alert>
      ) : problem ? (
        <SaveProblemAlert
          problem={problem}
          label={label}
          checkHint={checkHint}
          change={Boolean(change)}
        />
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting || offline || (change && !change.changed)}
        className="w-full whitespace-normal"
        aria-describedby={problem || offline ? 'schedule-save-problem' : undefined}
      >
        {isSubmitting
          ? words.saving
          : offline
            ? saveMessages.connectToSave
            : problem === 'unconfirmed'
              ? words.retry
              : words.save}
      </Button>
    </StickyActions>
  )
}

function SaveProblemAlert({
  problem,
  label,
  checkHint,
  change,
}: {
  problem: SaveProblem
  label: string
  checkHint: string
  change: boolean
}) {
  const setup = {
    unconfirmed: {
      title: 'Your schedule might not have saved.',
      body: `${label} itself is saved.`,
    },
    rejected: {
      title: "Schedule wasn't saved.",
      body: `${label} is saved without a schedule. ${checkHint}`,
    },
    conflict: { title: 'A schedule is already saved.', body: 'Open Medications to review it.' },
  }
  // A change's conflict has its own recovery in place of the save action.
  const changes = {
    unconfirmed: {
      title: saveMessages.mightNotHaveSaved,
      body: 'Your changes are still here, and trying again saves them only once.',
    },
    rejected: { title: "Changes weren't saved.", body: checkHint },
  }
  const copy = change && problem !== 'conflict' ? changes[problem] : setup[problem]
  return (
    <Alert id="schedule-save-problem" variant="destructive">
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{copy.body}</AlertDescription>
    </Alert>
  )
}
