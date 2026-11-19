import { PrivateReadError } from '@/lib/session-check'
import { requestSave, type SaveResult } from '@/lib/session-saves'
import { parseMedicationNames, type MedicationNames, type MedicationNamesChange } from './contract'

export const medicationNamesKeys = {
  /** The account's saved Medication names preference. */
  status: () => ['medication-names', 'status'] as const,
  /** Turn on and Turn off saves, kept by the session's mutation cache across navigation. */
  changes: () => ['medication-names', 'change'] as const,
}

/** Browser read of the account's Medication names through the authenticated API route. */
export async function fetchMedicationNames(signal?: AbortSignal): Promise<MedicationNames> {
  const timeout = AbortSignal.timeout(12000)
  const response = await fetch('/api/medication-names', {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new PrivateReadError(response.status)
  return parseMedicationNames(await response.json())
}

/** Sets the account's Medication names. The action ID makes a retry return the original outcome. */
export function saveMedicationNames(
  change: MedicationNamesChange,
): Promise<SaveResult<MedicationNames>> {
  return requestSave('/api/medication-names', change, parseMedicationNames, 'PUT')
}
