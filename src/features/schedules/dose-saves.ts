import { hashKey, type QueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/toast'
import { dateLabel } from '@/lib/calendar-date'
import type { DoseUnit } from '@/lib/dose-quantity'
import { confirmSessionEnd } from '@/lib/session-check'
import { sessionSaves, type OutstandingSave } from '@/lib/session-saves'
import { saveMessages } from '@/lib/save-messages'
import { parseDoseOutcomeRecord, type DoseOccurrence, type DoseOutcomeRecord } from './contract'
import { reconciledConfirmation } from './dose-confirmation'
import { matchesDoseReceipt, type DoseAttempt } from './dose-receipt'
import {
  cachedRecords,
  historyDate,
  historyDayQuery,
  historyRecords,
  isHistoryKey,
  sameDose,
  scheduleKeys,
  scheduleSnapshotQuery,
  writeRecord,
  type ScheduleSnapshot,
} from './queries'
import { doseClock } from './taken-form-schema'

type Outcome = DoseOutcomeRecord['outcome']
export type PinnedCorrection = { outcome: Outcome; revision: number }
/** A fresh cache-backed check found a record, no record, or failed. */
export type RecordCheck = { record: DoseOutcomeRecord } | 'missing' | 'unknown'
export type SaveProblem = { kind: 'rejected' } | { kind: 'uncertain'; checked: boolean }
/** What a dose row shows while its save is pending or unconfirmed (FE-650 D21). */
export type PendingDose = { id: string; outcome: Outcome; unconfirmed?: boolean }
/** Raw Taken form values at submit and the Now minute they used, to reopen the attempt. */
export type AttemptForm = { values: unknown; now: string }

/** One occurrence's save, owned by the session so leaving Today or closing the drawer keeps it. */
export type DoseSave = {
  /** The exact request a retry resends; null once the attempt is discarded. */
  attempt: DoseAttempt | null
  correction: PinnedCorrection | null
  form?: AttemptForm
  medicine: { label: string; unit: DoseUnit }
  /** Istanbul today, read when needed, to name where the dose lives after a day rolls over. */
  today: () => string
  pending: boolean
  problem: SaveProblem | null
  error: string
  needsReview: boolean
}

/** The mounted screen's callbacks; the latest mount's are used, the last ones after unmount. */
export type DoseSaveEffects = {
  refresh: () => Promise<boolean>
  checkRecorded?: () => Promise<RecordCheck>
  onRecorded: (record: DoseOutcomeRecord) => void
}

export type DoseSaveRequest = {
  dose: DoseOccurrence
  outcome: Outcome
  details: Record<string, unknown>
  correction: PinnedCorrection | null
  form?: AttemptForm
  medicine: DoseSave['medicine']
  today: () => string
}

export const doseSaveKey = (dose: Pick<DoseOccurrence, 'scheduleId' | 'dueAt'>) =>
  `${dose.scheduleId}|${dose.dueAt}`

/** An unconfirmed attempt still offers Retry and is rechecked on focus and reconnect (F5, F6). */
export const isUnconfirmed = (save: DoseSave | undefined) =>
  !!save?.attempt && !save.pending && save.problem?.kind === 'uncertain' && !save.needsReview

const snapshotHash = hashKey(scheduleKeys.snapshot())

class DoseSaves {
  entries = new Map<string, DoseSave>()
  observers = new Map<string, number>()
  /** Bumps when a result ends the drawer's work (confirmed or conflict), so an observer closes. */
  finished = new Map<string, number>()
  effects = new Map<string, DoseSaveEffects>()
  openDrawers = new Set<string>()
  listeners = new Set<() => void>()
  version = 0
  active = true
  private stop: () => void

  constructor(private client: QueryClient) {
    // Any Today or History date read, the screen's own, the recheck below or a server-streamed
    // hydration ('added' or 'setState'), can establish receipt. Reconciling writes to the cache and adds
    // Toasts, so it runs after the cache has finished announcing the read.
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      const read =
        event.type === 'added' ||
        (event.type === 'updated' &&
          (event.action.type === 'success' || event.action.type === 'setState'))
      if (!read) return
      const { queryHash, queryKey, state } = event.query
      if (state.data === undefined) return
      const records =
        queryHash === snapshotHash
          ? (state.data as ScheduleSnapshot).records
          : isHistoryKey(queryKey)
            ? historyRecords(state.data as DoseOccurrence[])
            : null
      if (records) queueMicrotask(() => this.reconcile(records))
    })
    const recheck = () => {
      if (document.visibilityState === 'visible') this.recheck()
    }
    // Today server-renders; only the browser store listens for focus and reconnect.
    if (typeof window === 'undefined') {
      this.stop = unsubscribe
      return
    }
    window.addEventListener('focus', recheck)
    window.addEventListener('visibilitychange', recheck)
    window.addEventListener('online', recheck)
    this.stop = () => {
      unsubscribe()
      window.removeEventListener('focus', recheck)
      window.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('online', recheck)
    }
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
  }

  /** Sets an entry, dropping it once nothing is left to show or retry. */
  set(key: string, save: DoseSave | undefined) {
    if (!this.active) return
    if (!save || (!save.attempt && !save.pending && !save.error && !save.needsReview))
      this.entries.delete(key)
    else this.entries.set(key, save)
    this.emit()
  }
  update(key: string, patch: Partial<DoseSave>) {
    const save = this.entries.get(key)
    if (save) this.set(key, { ...save, ...patch })
  }
  /** Ends the attempt so the next save starts a new one. */
  discard(key: string) {
    this.update(key, { attempt: null, correction: null, form: undefined })
  }
  /** A mounted row or drawer; results with none mounted reach the user as a Toast. */
  observe(key: string) {
    this.observers.set(key, (this.observers.get(key) ?? 0) + 1)
    return () => {
      this.observers.set(key, (this.observers.get(key) ?? 1) - 1)
    }
  }
  /** An open drawer keeps Retry while the current outcome changes (FE-673). */
  openDrawer(key: string) {
    this.openDrawers.add(key)
    return () => {
      this.openDrawers.delete(key)
      // A record found while the drawer was open is applied once it closes.
      this.reconcile(cachedRecords(this.client))
    }
  }
  private finish(key: string) {
    this.finished.set(key, (this.finished.get(key) ?? 0) + 1)
    this.emit()
  }

  /** F6: what an unconfirmed attempt tried to save, for its row. */
  retryDetails(key: string) {
    const save = this.entries.get(key)
    if (!isUnconfirmed(save) || !save?.attempt) return null
    const { outcome, takenAt, quantity } = save.attempt.payload
    return outcome === 'Taken'
      ? { outcome, takenAt: String(takenAt), quantity: Number(quantity) }
      : { outcome }
  }

  /** Saves whose result the user could not see after signing out (D18). */
  outstanding(): OutstandingSave[] {
    return [...this.entries.values()].flatMap((save) =>
      save.attempt && (save.pending || save.problem?.kind === 'uncertain')
        ? [
            {
              kind: 'dose' as const,
              label: `${save.medicine.label} ${doseClock(save.attempt.payload.dueAt)}`,
            },
          ]
        : [],
    )
  }

  /** Pending and unconfirmed badges by occurrence key. */
  pendingDose(key: string): PendingDose | undefined {
    const save = this.entries.get(key)
    if (!save?.attempt) return undefined
    const { id, payload } = save.attempt
    if (save.pending) return { id, outcome: payload.outcome }
    if (isUnconfirmed(save)) return { id, outcome: payload.outcome, unconfirmed: true }
  }

  async submit(key: string, request: DoseSaveRequest) {
    const previous = this.entries.get(key)
    if (!this.active || previous?.pending || previous?.needsReview) return
    const { dose, outcome, details, correction } = request
    const fingerprint = JSON.stringify({ outcome, details, dose: dose.id, correction })
    let attempt = previous?.attempt
    if (!attempt || attempt.fingerprint !== fingerprint) {
      const id = crypto.randomUUID()
      attempt = {
        id,
        fingerprint,
        method: correction ? 'PATCH' : 'PUT',
        payload: {
          ...details,
          outcome,
          scheduleId: dose.scheduleId,
          dueAt: dose.dueAt,
          ...(correction
            ? {
                actionId: id,
                expectedRevision: correction.revision,
                expectedOutcome: correction.outcome,
              }
            : {}),
        },
      }
    }
    const sent = attempt
    this.set(key, {
      attempt,
      correction,
      form: request.form,
      medicine: request.medicine,
      today: request.today,
      pending: true,
      problem: null,
      error: '',
      needsReview: false,
    })
    const effects = () => this.effects.get(key)
    const settle = (patch: Partial<DoseSave>) => {
      this.update(key, { pending: false, ...patch })
      this.notifyAway(key, dose)
    }
    const confirm = (record: DoseOutcomeRecord) => {
      effects()?.onRecorded(record)
      // A receipt completes only the attempt whose response/check it belongs to.
      if (this.entries.get(key)?.attempt?.id === sent.id) {
        this.set(key, undefined)
        this.finish(key)
      } else this.update(key, { pending: false })
    }
    try {
      const response = await fetch('/api/schedules', {
        method: sent.method,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify(sent.payload),
      })
      if (!this.active) return
      if (response.status === 400) {
        settle({
          problem: { kind: 'rejected' },
          error:
            outcome === 'Taken'
              ? `${saveMessages.notSaved} ${saveMessages.takenTimeInPast}`
              : saveMessages.cannotSkip,
        })
      } else if (response.status === 401) {
        // Stays pending through the check. If the session is not over, the 401 says nothing about
        // the write, so it continues as an unconfirmed save; if it is, this store has ended.
        await confirmSessionEnd()
        if (!this.active) return
        throw new Error('uncertain')
      } else if (response.status === 409) {
        await effects()
          ?.refresh()
          .catch(() => false)
        settle({
          attempt: null,
          correction: null,
          form: undefined,
          error: correction
            ? "This dose changed somewhere else, so your change didn't save. Check what's saved now before changing it again."
            : "This dose is already logged. Check what's saved.",
          needsReview: true,
        })
        this.finish(key)
      } else if (response.ok) {
        const body = await response.json()
        if (!this.active) return
        const record = parseDoseOutcomeRecord(body.record)
        if (!matchesDoseReceipt(record, sent)) throw new Error('acknowledgment')
        confirm(record)
      } else {
        throw new Error('uncertain')
      }
    } catch {
      if (!this.active) return
      const checkRecorded = effects()?.checkRecorded
      const check: RecordCheck =
        checkRecorded && navigator.onLine
          ? await checkRecorded().catch((): RecordCheck => 'unknown')
          : 'unknown'
      if (!this.active) return
      const found = typeof check === 'object' ? check.record : null
      if (found && matchesDoseReceipt(found, sent)) {
        confirm(found)
      } else if (found && (!correction || (found.revision ?? 0) !== correction.revision)) {
        // Current outcome is known; receipt of this attempt is still unknown. Keep its details.
        settle({
          problem: { kind: 'uncertain', checked: false },
          error: saveMessages.doseChanged,
          needsReview: true,
        })
      } else {
        settle({
          problem: { kind: 'uncertain', checked: check === 'missing' },
          error: `${saveMessages.mightNotHaveSaved} Check your connection and try again with the same details.`,
        })
      }
    }
  }

  /** A result that arrives with no drawer watching reaches the user wherever they are (F1). */
  private notifyAway(key: string, dose: DoseOccurrence) {
    const save = this.entries.get(key)
    if (!save || this.observers.get(key)) return
    const head = `${save.medicine.label} ${doseClock(dose.dueAt)} ·`
    const date = historyDate(dose.dueAt)
    const today = save.today()
    // Today shows only doses due today; History shows every dose on its History date.
    const open = date === today ? 'Open Today' : `Open History for ${dateLabel(date, today)}`
    toast.add({
      title: isUnconfirmed(save)
        ? `${head} might not have saved. ${open} to try again`
        : save.needsReview
          ? `${head} not saved. ${open} to check what's saved`
          : `${head} not saved. ${open} to try again`,
      type: 'warning',
      timeout: 0,
    })
  }

  /**
   * Focus and reconnect read again where each unconfirmed attempt's dose lives (F5): Today for
   * a dose due on its date, otherwise the dose's History date.
   */
  private recheck() {
    const reads = new Map<string, boolean>()
    for (const save of this.entries.values()) {
      if (!isUnconfirmed(save) || !save.attempt) continue
      const date = historyDate(save.attempt.payload.dueAt)
      reads.set(date, date === save.today())
    }
    // Each joins a read already in flight, such as the screen's own focus refresh.
    for (const [date, dueToday] of reads) {
      const read = dueToday
        ? this.client.fetchQuery({ ...scheduleSnapshotQuery(), staleTime: 0 })
        : this.client.fetchQuery({ ...historyDayQuery(date), staleTime: 0 })
      void read.catch(() => {})
    }
  }

  /**
   * A record matching an unconfirmed attempt confirms it once, with "already saved" wording.
   * A different current outcome leaves a closed row explicit review instead of a lasting
   * "Might not have saved"; an open drawer keeps offering Retry (FE-673).
   */
  private reconcile(records: DoseOutcomeRecord[]) {
    if (!this.active) return
    for (const [key, save] of this.entries) {
      if (!isUnconfirmed(save) || !save.attempt) continue
      const attempt = save.attempt.payload
      const found = records.find((record) => sameDose(record, attempt))
      if (!found) continue
      if (!matchesDoseReceipt(found, save.attempt)) {
        const changed = !save.correction || (found.revision ?? 0) !== save.correction.revision
        if (changed && !this.openDrawers.has(key))
          this.update(key, {
            problem: { kind: 'uncertain', checked: false },
            error: saveMessages.doseChanged,
            needsReview: true,
          })
        continue
      }
      this.set(key, undefined)
      this.finish(key)
      // The read covered one view; the other view's cache shows the record too.
      writeRecord(this.client, found)
      toast.add({
        title: reconciledConfirmation({ ...save.medicine, record: found }),
        type: found.outcome === 'Taken' ? 'success' : 'skipped',
      })
    }
  }

  end() {
    this.active = false
    this.stop()
    this.entries.clear()
    this.effects.clear()
    this.version++
    this.listeners.forEach((listener) => listener())
    this.listeners.clear()
  }
}

const stores = new WeakMap<QueryClient, DoseSaves>()

/** The session's dose saves; they end with the session's other saves (FE-669). */
export function doseSaves(client: QueryClient) {
  let store = stores.get(client)
  if (!store) {
    const session = sessionSaves(client)
    const created = new DoseSaves(client)
    stores.set(client, created)
    if (session.active) {
      session.onEnd(() => created.end())
      session.addOutstanding(() => created.outstanding())
      created.subscribe(() => session.emit())
    } else created.end()
    store = created
  }
  return store
}
