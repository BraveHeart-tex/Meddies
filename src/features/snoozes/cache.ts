import type { DoseSnooze } from './contract'

// Browser ordering only, no private state. Reads take a ticket before starting; confirmations
// take one after acceptance. Untagged server hydration cannot erase a local confirmation.
let version = 0
export const snoozeReadVersion = () => ++version
const reads = new WeakMap<object, number>()
export function markSnoozeRead<T extends object>(data: T, readVersion: number): T {
  reads.set(data, readVersion)
  return data
}
export const snoozeVersionOf = (data: object) => reads.get(data) ?? 0
export type CachedSnooze = Pick<DoseSnooze, 'outcome' | 'targetAt'> & { confirmedVersion?: number }
export function mergeSnooze(
  previous: CachedSnooze | undefined,
  incoming: CachedSnooze | undefined,
  readVersion = 0,
) {
  return previous?.confirmedVersion &&
    previous.confirmedVersion >= Math.max(readVersion, incoming?.confirmedVersion ?? 0)
    ? previous
    : incoming
}
