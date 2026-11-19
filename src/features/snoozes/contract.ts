// Runtime-neutral Snooze command (#36, docs/product/reminders.md #9 and #36). A Snooze names a
// Not logged dose's Occurrence and an action UUID; a retry returns its original outcome. The
// server answers `snoozed` with the target 40 minutes after accepting, `dropped` when that target
// is inside Quiet hours (accepted, its Follow-up reminder consumed, no reminder sent), or
// `rejected` with the reason, having written nothing.
import { ApplicationError } from '../../lib/application-error'
import { isInstant, parseOccurrenceKey, type DoseOccurrenceKey } from '../schedules/contract'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const snoozeRejections = [
  /** The Occurrence does not exist or belongs to another account. */
  'notFound',
  /** The account has no Device registration. */
  'notificationsOff',
  /** Taken or Skipped is recorded. */
  'logged',
  /** The Schedule is paused. */
  'paused',
  /** Before the dose's due instant. */
  'notDue',
  /** After due +80 minutes. */
  'expired',
  /** A newer Occurrence of the same Medicine is due. */
  'superseded',
  /** A Snooze of this dose is pending. */
  'pending',
  /** Both Follow-up reminders are used. */
  'exhausted',
  /** The remaining Follow-up reminder is targeted inside Quiet hours. */
  'quietHours',
] as const
export type SnoozeRejection = (typeof snoozeRejections)[number]

export type SnoozeRequest = DoseOccurrenceKey & { actionId: string }
export type SnoozeResult =
  | { outcome: 'snoozed' | 'dropped'; targetAt: string }
  | { outcome: 'rejected'; reason: SnoozeRejection }

export type SnoozeCommand = { operation: 'snooze'; ownerId: string; request: SnoozeRequest }

export function parseSnoozeRequest(value: unknown): SnoozeRequest {
  const occurrence = parseOccurrenceKey(value)
  const { actionId } = value as Record<string, unknown>
  if (typeof actionId !== 'string' || !uuid.test(actionId))
    throw new ApplicationError('validation', 400)
  return { ...occurrence, actionId: actionId.toLowerCase() }
}

export function parseSnoozeResult(value: unknown): SnoozeResult {
  const input = value as Record<string, unknown> | null
  if ((input?.outcome === 'snoozed' || input?.outcome === 'dropped') && isInstant(input.targetAt))
    return { outcome: input.outcome, targetAt: input.targetAt }
  if (input?.outcome === 'rejected' && snoozeRejections.includes(input.reason as SnoozeRejection))
    return { outcome: 'rejected', reason: input.reason as SnoozeRejection }
  throw new Error('snooze contract')
}

/** Current read result, distinct from the immutable Snooze command receipt. */
export type DoseSnooze = DoseOccurrenceKey & {
  outcome: 'pending' | 'quietHours'
  targetAt: string
}

export function parseDoseSnooze(value: unknown): DoseSnooze {
  const occurrence = parseOccurrenceKey(value)
  const { outcome, targetAt } = value as Record<string, unknown>
  if ((outcome !== 'pending' && outcome !== 'quietHours') || !isInstant(targetAt))
    throw new Error('snooze read contract')
  return { ...occurrence, outcome, targetAt }
}
