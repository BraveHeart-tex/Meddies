import { PrivateReadError } from '@/lib/session-check'
import { requestSave, type SaveResult } from '@/lib/session-saves'
import { parseQuietHours, type QuietHours, type QuietHoursChange } from './contract'

export const quietHoursKeys = {
  /** The account's saved Quiet hours preference. */
  status: () => ['quiet-hours', 'status'] as const,
  /** Turn on and Turn off saves, kept by the session's mutation cache across navigation. */
  changes: () => ['quiet-hours', 'change'] as const,
}

/** Browser read of the account's Quiet hours through the authenticated API route. */
export async function fetchQuietHours(signal?: AbortSignal): Promise<QuietHours> {
  const timeout = AbortSignal.timeout(12000)
  const response = await fetch('/api/quiet-hours', {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new PrivateReadError(response.status)
  return parseQuietHours(await response.json())
}

/** Sets the account's Quiet hours. The action ID makes a retry return the original outcome. */
export function saveQuietHours(change: QuietHoursChange): Promise<SaveResult<QuietHours>> {
  return requestSave('/api/quiet-hours', change, parseQuietHours, 'PUT')
}
