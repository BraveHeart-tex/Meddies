import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { saveMessages } from '@/lib/save-messages'
import type { DoseOutcomeRecord } from './contract'
import type { SaveProblem } from './dose-saves'

const rejected: Record<DoseOutcomeRecord['outcome'], string> = {
  Taken: saveMessages.takenTimeInPast,
  Skipped: saveMessages.cannotSkip,
}

/**
 * Why a dose save was not confirmed (648·F3, F4), or the known-offline line (650·D22).
 * Values stay in the form either way. `changed` is true once details differ from the
 * unconfirmed save, which then starts a new save.
 */
export function DoseSaveProblem({
  id,
  outcome,
  problem,
  offline,
  changed = false,
}: {
  id: string
  outcome: DoseOutcomeRecord['outcome']
  problem: SaveProblem | null
  offline: boolean
  changed?: boolean
}) {
  if (problem?.kind === 'uncertain')
    return (
      <Alert id={id} variant="destructive">
        <AlertTitle>{saveMessages.mightNotHaveSaved}</AlertTitle>
        <AlertDescription>
          {outcome === 'Taken' && 'Your details are still here. '}
          {problem.checked && "Meddies checked and can't find it yet. "}
          {changed
            ? 'Changing details starts a new save.'
            : "Check your connection and try again. It won't save twice."}
        </AlertDescription>
      </Alert>
    )
  if (offline)
    return (
      <Alert id={id}>
        <InfoIcon aria-hidden="true" />
        <AlertDescription>
          {saveMessages.offline}{' '}
          {outcome === 'Taken' ? 'Your details stay here.' : 'Nothing is saved yet.'} Save once
          you&apos;re back online.
        </AlertDescription>
      </Alert>
    )
  if (!problem) return null
  return (
    <Alert id={id} variant="destructive">
      <AlertTitle>{saveMessages.notSaved}</AlertTitle>
      <AlertDescription>{rejected[outcome]}</AlertDescription>
    </Alert>
  )
}
