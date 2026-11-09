import type { QueryClient } from '@tanstack/react-query'
import { confirmSessionEnd } from './session-check'

export type SaveProblem = 'rejected' | 'unconfirmed' | 'conflict'
export type SaveResult<T> = { saved: T; problem?: never } | { saved?: never; problem: SaveProblem }
export type SaveAttempt = {
  id: string
  fingerprint: string
  payload: Record<string, unknown>
  label: string
  kind: 'medicine' | 'schedule'
  href: string
  status: 'pending' | 'settled'
  result?: SaveResult<unknown>
  openHref?: string
}
/** A pending or unconfirmed save, named for the sign-out warning (D18). */
export type OutstandingSave = { kind: 'medicine' | 'schedule' | 'dose'; label: string }

/** Shared HTTP outcome classification. Connectivity loss never implies a rejected write. */
export async function requestSave<T>(
  url: string,
  payload: Record<string, unknown>,
  decode: (data: unknown) => T,
): Promise<SaveResult<T>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    })
    if (response.ok) return { saved: decode(await response.json()) }
    // Stays pending through the check. If the session is not over, a 401 says nothing about the
    // write, so the attempt stays retryable; if it is, session end drops this result.
    if (response.status === 401) await confirmSessionEnd()
    const problem = { 400: 'rejected', 409: 'conflict' } as const
    return { problem: problem[response.status as keyof typeof problem] ?? 'unconfirmed' }
  } catch {
    return { problem: 'unconfirmed' }
  }
}

class SessionSaves {
  active = true
  entries = new Map<string, SaveAttempt>()
  observers = new Map<string, number>()
  listeners = new Set<() => void>()
  endListeners = new Set<() => void>()
  outstandingSources = new Set<() => OutstandingSave[]>()
  version = 0
  // Toast identity survives route host remounts. Session end removes every private Toast.
  toasts = new Map<string, string>()
  notified = new Map<string, SaveAttempt>()
  dismissToast?: (id: string) => void
  setToastDismiss(dismiss: (id: string) => void) {
    this.dismissToast = dismiss
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  snapshot = () => this.version
  /** Other session-owned stores (dose saves) end with this one. */
  onEnd(listener: () => void) {
    this.endListeners.add(listener)
  }
  /** Other session-owned stores (dose saves) report their outstanding saves here too. */
  addOutstanding(source: () => OutstandingSave[]) {
    this.outstandingSources.add(source)
  }
  outstanding(): OutstandingSave[] {
    const own = [...this.entries.values()].flatMap((attempt) =>
      attempt.status === 'pending' || attempt.result?.problem === 'unconfirmed'
        ? [{ kind: attempt.kind, label: attempt.label }]
        : [],
    )
    return [...own, ...[...this.outstandingSources].flatMap((source) => source())]
  }
  emit() {
    this.version++
    this.listeners.forEach((listener) => listener())
  }
  /** Readonly feedback information; Toast bookkeeping stays session-owned. */
  feedback() {
    return [...this.entries].map(([key, attempt]) => {
      const saved = attempt.result?.saved
      return {
        key,
        label: attempt.label,
        kind: attempt.kind,
        pending: attempt.status === 'pending',
        saved: Boolean(saved),
        savedId:
          saved && typeof saved === 'object' && 'id' in saved && typeof saved.id === 'string'
            ? saved.id
            : undefined,
        href: attempt.href,
        openHref: attempt.openHref,
        observed: Boolean(this.observers.get(key)),
        notified: this.notified.get(key) === attempt,
        toast: this.toasts.get(key),
      } as const
    })
  }
  feedbackToast(key: string, id?: string) {
    if (id) this.toasts.set(key, id)
    else this.toasts.delete(key)
  }
  feedbackHandled(key: string) {
    const attempt = this.entries.get(key)
    if (attempt) this.notified.set(key, attempt)
  }
  observe(key: string) {
    this.observers.set(key, (this.observers.get(key) ?? 0) + 1)
    this.emit()
    return () => {
      this.observers.set(key, (this.observers.get(key) ?? 1) - 1)
      this.emit()
    }
  }
  clear(key: string) {
    if (this.entries.get(key)?.status === 'pending') return
    this.entries.delete(key)
    this.emit()
  }
  async submit<T>(
    key: string,
    details: Omit<SaveAttempt, 'id' | 'fingerprint' | 'status' | 'result'>,
    execute: (payload: Record<string, unknown>, active: () => boolean) => Promise<SaveResult<T>>,
  ) {
    if (!this.active || (typeof navigator !== 'undefined' && !navigator.onLine)) return
    const previous = this.entries.get(key)
    if (previous?.status === 'pending' || previous?.result?.problem === 'conflict') return
    const priorToast = this.toasts.get(key)
    if (priorToast) this.dismissToast?.(priorToast)
    this.toasts.delete(key)
    const fingerprint = JSON.stringify(details.payload)
    const retry =
      previous?.result?.problem === 'unconfirmed' && previous.fingerprint === fingerprint
    const id = retry ? previous.id : crypto.randomUUID()
    const attempt: SaveAttempt = {
      ...details,
      id,
      fingerprint,
      payload: retry ? previous.payload : { ...details.payload, id },
      status: 'pending',
    }
    this.entries.set(key, attempt)
    this.emit()
    let result: SaveResult<T>
    try {
      result = await execute(attempt.payload, () => this.active)
    } catch {
      result = { problem: 'unconfirmed' }
    }
    if (!this.active) return
    this.entries.set(key, { ...attempt, status: 'settled', result })
    this.emit()
  }
  end() {
    this.active = false
    this.toasts.forEach((id) => this.dismissToast?.(id))
    this.toasts.clear()
    this.entries.clear()
    this.emit()
    this.listeners.clear()
    this.endListeners.forEach((listener) => listener())
    this.endListeners.clear()
    this.outstandingSources.clear()
  }
}

const sessions = new WeakMap<QueryClient, SessionSaves>()
export function sessionSaves(client: QueryClient) {
  let store = sessions.get(client)
  if (!store) {
    store = new SessionSaves()
    sessions.set(client, store)
  }
  return store
}
export function endSessionSaves(client: QueryClient) {
  sessions.get(client)?.end()
}
