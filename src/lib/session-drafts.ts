import type { QueryClient } from '@tanstack/react-query'

// Separate from query data and RHF. The session client scopes ownership, without a GC timer
// or browser storage. Session end empties a client's drafts and refuses later writes to it.
const drafts = new WeakMap<QueryClient, Map<string, unknown>>()
const ended = new WeakSet<QueryClient>()

export function discardSessionFormDraft(client: QueryClient, key: string) {
  drafts.get(client)?.delete(key)
}

/** Non-form draft values, such as which outcome an open drawer had chosen. */
export function readSessionDraft<T>(client: QueryClient, key: string) {
  return drafts.get(client)?.get(key) as T | undefined
}

export function writeSessionDraft(client: QueryClient, key: string, value: unknown) {
  if (ended.has(client)) return
  let store = drafts.get(client)
  if (!store) {
    store = new Map()
    drafts.set(client, store)
  }
  store.set(key, structuredClone(value))
}

export function endSessionDrafts(client: QueryClient) {
  ended.add(client)
  drafts.delete(client)
}
