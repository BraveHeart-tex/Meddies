import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { DoseOutcomeRecord } from './contract'
import type { SaveProblem } from './use-dose-outcome-mutation'

const rejected: Record<DoseOutcomeRecord['outcome'], string> = {
  Taken: 'Taken time must be a time that has already passed. Change the time and save again.',
  Skipped: 'This scheduled dose can no longer be skipped. Refresh Today to check its status.',
}

/**
 * Why a dose save was not confirmed (FE-648 F3, F4), or the known-offline line (FE-650 D22).
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
        <AlertTitle>Save could not be confirmed.</AlertTitle>
        <AlertDescription>
          {outcome === 'Taken' && 'Your details are still here. '}
          {problem.checked && 'Meddies checked and found no record yet. '}
          {changed
            ? 'Changing details starts a new save.'
            : 'Connect and retry; it will not be saved twice.'}
        </AlertDescription>
      </Alert>
    )
  if (offline)
    return (
      <Alert id={id}>
        <InfoIcon aria-hidden="true" />
        <AlertDescription>
          You&apos;re offline.{' '}
          {outcome === 'Taken' ? 'Your details stay here.' : 'Nothing is saved.'}
        </AlertDescription>
      </Alert>
    )
  if (!problem) return null
  return (
    <Alert id={id} variant="destructive">
      <AlertTitle>{problem.kind === 'rejected' ? 'Not saved.' : 'Your session ended.'}</AlertTitle>
      <AlertDescription>
        {problem.kind === 'rejected' ? rejected[outcome] : 'Sign in again to record this dose.'}
      </AlertDescription>
    </Alert>
  )
}
