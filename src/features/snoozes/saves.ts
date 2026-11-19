// #397: session-owned Snooze attempts survive route/drawer unmount. Only command receipts
// confirm an attempt (reads have no action ID). No Snooze result or recovery creates a Toast.
import type { QueryClient } from '@tanstack/react-query'
import { formatTime } from '@/lib/calendar-date'
import { sessionSaves, requestSave } from '@/lib/session-saves'
import type { DoseOccurrence } from '../schedules/contract'
import {
  historyDate,
  readFreshHistoryDay,
  readFreshSnapshot,
  scheduleKeys,
  sameDose,
  type ScheduleSnapshot,
} from '../schedules/queries'
import { parseSnoozeResult, type SnoozeRequest, type SnoozeRejection } from './contract'
import { snoozeReadVersion, type CachedSnooze } from './cache'

type Attempt = {
  payload: SnoozeRequest
  label: string
  pending: boolean
  uncertain?: boolean
  reason?: SnoozeRejection
}
export const snoozeKey = (dose: Pick<DoseOccurrence, 'scheduleId' | 'dueAt'>) =>
  `${dose.scheduleId}|${dose.dueAt}`
class SnoozeSaves {
  entries = new Map<string, Attempt>()
  private listeners = new Set<() => void>()
  private version = 0
  constructor(private client: QueryClient) {
    const session = sessionSaves(client)
    session.onEnd(() => {
      this.entries.clear()
      this.emit()
      this.listeners.clear()
    })
    session.addOutstanding(() =>
      [...this.entries.values()].flatMap((entry) =>
        entry.pending || entry.uncertain ? [{ kind: 'dose' as const, label: entry.label }] : [],
      ),
    )
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  snapshot = () => this.version
  private emit() {
    this.version++
    this.listeners.forEach((listener) => listener())
    sessionSaves(this.client).emit()
  }
  async refresh(dose: DoseOccurrence) {
    if (!sessionSaves(this.client).active) return false
    const snapshot = this.client.getQueryData<{ date: string }>(scheduleKeys.snapshot())
    try {
      const date = historyDate(dose.dueAt)
      const reads: Promise<unknown>[] = []
      if (snapshot?.date === date) reads.push(readFreshSnapshot(this.client))
      if (!reads.length || this.client.getQueryData(scheduleKeys.history(date)))
        reads.push(readFreshHistoryDay(this.client, date))
      await Promise.all(reads)
      return sessionSaves(this.client).active
    } catch {
      return false
    }
  }
  async submit(dose: DoseOccurrence, label: string) {
    const session = sessionSaves(this.client)
    const key = snoozeKey(dose)
    const previous = this.entries.get(key)
    if (!session.active || !navigator.onLine || previous?.pending) return
    const payload = previous?.uncertain
      ? previous.payload
      : {
          actionId: crypto.randomUUID(),
          scheduleId: dose.scheduleId,
          dueAt: dose.dueAt,
        }
    const attempt: Attempt = { payload, label: `${label} ${formatTime(dose.dueAt)}`, pending: true }
    this.entries.set(key, attempt)
    this.emit()
    const response = await requestSave('/api/snoozes', payload, parseSnoozeResult)
    if (!session.active) return
    const result = response.saved
    attempt.pending = false
    if (!result) attempt.uncertain = true
    else if (result.outcome === 'rejected') {
      attempt.reason = result.reason
      if (result.reason === 'pending') {
        await this.refresh(dose)
        if (!session.active) return
      }
    } else {
      const snooze: CachedSnooze = {
        outcome: result.outcome === 'snoozed' ? 'pending' : 'quietHours',
        targetAt: result.targetAt,
      }
      publishSnooze(this.client, dose, snooze)
    }
    this.emit()
  }
  async review(dose: DoseOccurrence) {
    if (await this.refresh(dose)) {
      this.entries.delete(snoozeKey(dose))
      this.emit()
    }
  }
}
const stores = new WeakMap<QueryClient, SnoozeSaves>()
export function snoozeSaves(client: QueryClient) {
  let store = stores.get(client)
  if (!store) {
    store = new SnoozeSaves(client)
    stores.set(client, store)
  }
  return store
}

/** Publishes the receipt to both loaded views. A subsequent fresh read can settle it. */
export function publishSnooze(client: QueryClient, dose: DoseOccurrence, snooze: CachedSnooze) {
  const confirmed = { ...snooze, confirmedVersion: snoozeReadVersion() }
  client.setQueryData<ScheduleSnapshot>(
    scheduleKeys.snapshot(),
    (current) =>
      current && {
        ...current,
        snoozes: [
          ...(current.snoozes ?? []).filter((item) => !sameDose(item, dose)),
          {
            scheduleId: dose.scheduleId,
            dueAt: dose.dueAt,
            ...confirmed,
          },
        ],
      },
  )
  client.setQueryData<DoseOccurrence[]>(scheduleKeys.history(historyDate(dose.dueAt)), (current) =>
    current?.map((item) => (sameDose(item, dose) ? { ...item, snooze: confirmed } : item)),
  )
}
