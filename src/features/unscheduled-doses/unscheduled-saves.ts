// Session-owned Unscheduled dose saves: Log a dose, a change and a removal (241·S4 to S10).
// Like dose saves (`schedules/dose-saves.ts`): one action ID per attempt, reused with the exact
// body on every retry; closing the drawer or leaving the screen never cancels a save; a result
// with no drawer watching arrives as a Toast; an unconfirmed attempt confirms once a Today or
// History read shows it. Removals have no read evidence, so only their retry confirms them.
import type { QueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/toast'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import type { DoseUnit } from '@/lib/dose-quantity'
import { saveMessages } from '@/lib/save-messages'
import { confirmSessionEnd } from '@/lib/session-check'
import { discardSessionFormDraft } from '@/lib/session-drafts'
import { sessionSaves, type OutstandingSave } from '@/lib/session-saves'
import type { AttemptForm, SaveProblem } from '../schedules/dose-save-state'
import { readFreshHistoryDay, readFreshSnapshot, scheduleKeys } from '../schedules/queries'
import { parseUnscheduledDoseRecord, takenDate, type UnscheduledDose } from './contract'
import { removedMessage, savedMessage } from './messages'
import { isUnscheduledKey, writeUnscheduledDose } from './queries'

export type UnscheduledCommand =
  | { kind: 'log'; medicineId: string; takenAt: string; quantity: number }
  | { kind: 'change'; dose: UnscheduledDose; takenAt: string; quantity: number }
  | { kind: 'remove'; dose: UnscheduledDose }

type Attempt = Readonly<{
  id: string
  fingerprint: string
  command: UnscheduledCommand
  body: Readonly<Record<string, unknown>>
}>

export type UnscheduledSave = {
  attempt: Attempt | null
  form?: AttemptForm
  medicine: Readonly<{ label: string; unit: DoseUnit }>
  /** Istanbul today, read when needed. */
  today: () => string
  pending: boolean
  problem: SaveProblem | null
  /** A change or removal that met a newer revision; its drawer must close to see it. */
  conflict: boolean
}

export type UnscheduledSaveRequest = {
  command: UnscheduledCommand
  form?: AttemptForm
  medicine: UnscheduledSave['medicine']
  today: () => string
}

/** One save per Log a dose drawer and per saved dose. */
export const logSaveKey = (medicineId: string) => `log:${medicineId}`
export const doseSaveKey = (doseId: string) => `dose:${doseId}`
export const logDraftKey = (medicineId: string) => `unscheduled-log:${medicineId}`
export const changeDraftKey = (doseId: string) => `unscheduled-change:${doseId}`

export const conflictMessage =
  "This dose changed somewhere else, so your change didn't save. Close this and open the dose again to see what's saved."

/** The server's dose belongs to this attempt and holds exactly what it sent. */
function matches(dose: UnscheduledDose, attempt: Attempt) {
  const { command, id } = attempt
  if (dose.actionId !== id) return false
  if (command.kind === 'remove')
    return (
      dose.id === command.dose.id && dose.removed && dose.revision === command.dose.revision + 1
    )
  const sameIntake =
    !dose.removed && dose.takenAt === command.takenAt && dose.quantity === command.quantity
  return command.kind === 'log'
    ? sameIntake && dose.revision === 0 && dose.medicineId === command.medicineId
    : sameIntake && dose.id === command.dose.id && dose.revision === command.dose.revision + 1
}

function bodyOf(command: UnscheduledCommand, actionId: string) {
  if (command.kind === 'log') {
    const { medicineId, takenAt, quantity } = command
    return { actionId, medicineId, takenAt, quantity }
  }
  const key = { actionId, doseId: command.dose.id, expectedRevision: command.dose.revision }
  return command.kind === 'remove'
    ? { ...key, removed: true }
    : { ...key, removed: false, takenAt: command.takenAt, quantity: command.quantity }
}

const isUnconfirmed = (save: UnscheduledSave | undefined) =>
  !!save?.attempt && !save.pending && save.problem?.kind === 'uncertain'

class UnscheduledSaves {
  private entries = new Map<string, UnscheduledSave>()
  private observers = new Map<string, number>()
  /** Bumps when a result ends the drawer's work, so a watching drawer closes. */
  private finished = new Map<string, number>()
  private listeners = new Set<() => void>()
  private version = 0
  private active = true
  private stop: () => void

  constructor(private client: QueryClient) {
    // Any Today or History read seeds Unscheduled doses; one can confirm an unconfirmed attempt.
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' && event.type !== 'added') return
      const { queryKey, state } = event.query
      if (!isUnscheduledKey(queryKey) || !state.data) return
      const doses = state.data as UnscheduledDose[]
      queueMicrotask(() => this.reconcile(doses))
    })
    if (typeof window === 'undefined') {
      this.stop = unsubscribe
      return
    }
    const recheck = () => {
      if (document.visibilityState === 'visible') this.recheck()
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
  private set(key: string, save: UnscheduledSave | undefined) {
    if (!this.active) return
    if (!save || (!save.attempt && !save.pending && !save.problem && !save.conflict))
      this.entries.delete(key)
    else this.entries.set(key, save)
    this.emit()
  }
  private update(key: string, patch: Partial<UnscheduledSave>) {
    const save = this.entries.get(key)
    if (save) this.set(key, { ...save, ...patch })
  }
  get(key: string): Readonly<UnscheduledSave> | undefined {
    return this.entries.get(key)
  }
  completion(key: string) {
    return this.finished.get(key) ?? 0
  }
  /** A mounted drawer; results with none mounted reach the user as a Toast. */
  observe(key: string) {
    this.observers.set(key, (this.observers.get(key) ?? 0) + 1)
    return () => {
      this.observers.set(key, (this.observers.get(key) ?? 1) - 1)
    }
  }
  /** Ends a settled save's feedback and attempt, as the user dismisses its drawer. */
  dismiss(key: string) {
    const save = this.entries.get(key)
    if (save && !save.pending && !isUnconfirmed(save)) this.set(key, undefined)
  }
  private finish(key: string) {
    this.finished.set(key, (this.finished.get(key) ?? 0) + 1)
    this.emit()
  }

  /** Saves whose result the user could not see after signing out. */
  outstanding(): OutstandingSave[] {
    return [...this.entries.values()].flatMap((save) =>
      save.attempt && (save.pending || save.problem?.kind === 'uncertain')
        ? [{ kind: 'dose' as const, label: label(save, save.attempt) }]
        : [],
    )
  }

  /** Resolves true once the server confirmed this attempt. */
  async submit(key: string, request: UnscheduledSaveRequest): Promise<boolean> {
    const previous = this.entries.get(key)
    if (!this.active || previous?.pending || previous?.conflict) return false
    const fingerprint = JSON.stringify(request.command)
    // An unconfirmed attempt retries with its own action ID; changed details start a new one.
    const attempt =
      previous?.attempt && previous.attempt.fingerprint === fingerprint && isUnconfirmed(previous)
        ? previous.attempt
        : (() => {
            const id = crypto.randomUUID()
            return { id, fingerprint, command: request.command, body: bodyOf(request.command, id) }
          })()
    this.set(key, {
      attempt,
      form: request.form,
      medicine: request.medicine,
      today: request.today,
      pending: true,
      problem: null,
      conflict: false,
    })
    const settle = (patch: Partial<UnscheduledSave>) => {
      this.update(key, { pending: false, ...patch })
      this.notifyAway(key)
    }
    try {
      const response = await fetch('/api/schedules/unscheduled', {
        method: attempt.command.kind === 'log' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify(attempt.body),
      })
      if (!this.active) return false
      if (response.status === 400) {
        settle({ problem: { kind: 'rejected' } })
        return false
      }
      if (response.status === 409) {
        settle({ problem: null, conflict: true })
        void this.readDate(attempt).catch(() => {})
        return false
      }
      if (response.status === 401) {
        // Stays pending through the check; if the session is not over, the 401 says nothing
        // about the write, so it continues as an unconfirmed save.
        await confirmSessionEnd()
        if (!this.active) return false
        throw new Error('uncertain')
      }
      if (!response.ok) throw new Error('uncertain')
      const dose = parseUnscheduledDoseRecord((await response.json()).dose)
      if (!this.active) return false
      if (!matches(dose, attempt)) throw new Error('acknowledgment')
      this.confirm(key, attempt, dose, false)
      return true
    } catch {
      if (!this.active) return false
      settle({ problem: { kind: 'uncertain', checked: false } })
      return false
    }
  }

  /** A confirmed dose updates Today and History, ends the attempt and says what was saved. */
  private confirm(key: string, attempt: Attempt, dose: UnscheduledDose, reconciled: boolean) {
    const save = this.entries.get(key)
    if (!save || save.attempt?.id !== attempt.id) return
    const { command } = attempt
    const dates = writeUnscheduledDose(
      this.client,
      dose,
      command.kind === 'log' ? undefined : command.dose,
    )
    discardSessionFormDraft(
      this.client,
      command.kind === 'log' ? logDraftKey(command.medicineId) : changeDraftKey(command.dose.id),
    )
    // Fresh reads reconcile the dates it touched; they cancel older reads in flight.
    const today = save.today()
    for (const date of dates)
      void this.client
        .invalidateQueries({
          queryKey: date === today ? scheduleKeys.snapshot() : scheduleKeys.history(date),
          exact: true,
        })
        .catch(() => {})
    this.set(key, undefined)
    this.finish(key)
    const title =
      command.kind === 'remove'
        ? removedMessage(save.medicine, command.dose)
        : savedMessage(save.medicine, dose, today, command.kind === 'change')
    // A removal's Toast has no check: a check means Taken (241·S10).
    toast.add({
      title: reconciled ? `${title}. It was already saved` : title,
      type: command.kind === 'remove' ? undefined : 'success',
    })
  }

  private readDate(attempt: Attempt) {
    const { command } = attempt
    const date = takenDate(command.kind === 'log' ? command : command.dose)
    const save = [...this.entries.values()].find((item) => item.attempt?.id === attempt.id)
    return !save || date === save.today()
      ? readFreshSnapshot(this.client)
      : readFreshHistoryDay(this.client, date)
  }

  /** A result that arrives with no drawer watching reaches the user wherever they are. */
  private notifyAway(key: string) {
    const save = this.entries.get(key)
    const attempt = save?.attempt
    if (!save || this.observers.get(key) || !attempt) return
    const { command } = attempt
    const today = save.today()
    const date = command.kind === 'log' ? '' : takenDate(command.dose)
    // Log a dose lives on Medication detail; a saved dose on Today or its History date.
    const open =
      command.kind === 'log'
        ? `Open ${save.medicine.label} in Medications`
        : date === today
          ? 'Open Today'
          : `Open History for ${formatShortDay(date, today)}`
    const head = `${label(save, attempt)} ·`
    toast.add({
      title: isUnconfirmed(save)
        ? `${head} might not have saved. ${open} to try again`
        : save.conflict
          ? `${head} not saved. ${open} to check what's saved`
          : `${head} not saved. ${open} to try again`,
      type: 'warning',
      timeout: 0,
    })
  }

  /** Focus and reconnect read again where each unconfirmed attempt's dose lives. */
  private recheck() {
    for (const save of this.entries.values())
      if (isUnconfirmed(save) && save.attempt && save.attempt.command.kind !== 'remove')
        void this.readDate(save.attempt).catch(() => {})
  }

  /** A read showing an unconfirmed attempt's dose confirms it once. */
  private reconcile(doses: UnscheduledDose[]) {
    if (!this.active) return
    for (const [key, save] of this.entries) {
      if (!isUnconfirmed(save) || !save.attempt) continue
      const attempt = save.attempt
      const found = doses.find((dose) => matches(dose, attempt))
      if (found) this.confirm(key, attempt, found, true)
    }
  }

  end() {
    this.active = false
    this.stop()
    this.entries.clear()
    this.version++
    this.listeners.forEach((listener) => listener())
    this.listeners.clear()
  }
}

/** 'Ibuprofen 09:30': the dose a save is about, for a Toast or the sign-out warning. */
function label(save: UnscheduledSave, attempt: Attempt) {
  const { command } = attempt
  return `${save.medicine.label} ${formatTime(command.kind === 'remove' ? command.dose.takenAt : command.takenAt)}`
}

const stores = new WeakMap<QueryClient, UnscheduledSaves>()

/** The session's Unscheduled dose saves; they end with the session's other saves (#122). */
export function unscheduledSaves(client: QueryClient) {
  let store = stores.get(client)
  if (!store) {
    const session = sessionSaves(client)
    const created = new UnscheduledSaves(client)
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
