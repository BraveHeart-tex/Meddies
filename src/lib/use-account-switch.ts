'use client'

/**
 * One account-wide On/Off preference on Settings, such as Quiet hours (#381) and Medication names
 * (#389). The value reaches every device, so On and Off come only from the server: a read of the
 * saved value, or a confirmed save. Nothing is optimistic, so a failed read keeps the placeholder,
 * with no switch, until a focus or reconnect read succeeds. Each tap is one attempt with its own
 * action ID; a retry of a save that might not have saved resends the same change with the same
 * action ID, so the Worker returns the original outcome. A save that might not have saved rereads
 * the saved value, and its alert goes once the read shows the change. A confirmed save publishes
 * its value to the read's cache. Saves live in the session's mutation cache, so a pending save and
 * its failure survive navigation, and Turn on and Turn off share one mutation key so the latest
 * attempt wins.
 */
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type MutationState,
  type QueryKey,
} from '@tanstack/react-query'
import type { SaveResult } from './session-saves'
import { useKnownOffline } from './use-known-offline'

/**
 * The saved value plus the Turn on and Turn off saves' moments. `loading` is the row before the
 * saved value is known.
 */
export type AccountSwitchState =
  | 'loading'
  | 'off'
  | 'turning-on'
  | 'unconfirmed'
  | 'rejected'
  | 'on'
  | 'turning-off'
  | 'off-unconfirmed'
  | 'off-rejected'

type Value<K extends string> = Record<K, boolean>
type Change<K extends string> = Value<K> & { actionId: string }
type Attempt<K extends string> = MutationState<SaveResult<Value<K>>, Error, Change<K>>

export type AccountSwitch<K extends string> = {
  /** The preference's field in its read and set contracts. */
  field: K
  /** The saved value's query key. */
  statusKey: QueryKey
  /** The Turn on and Turn off saves' shared mutation key. */
  changesKey: QueryKey
  read: (signal: AbortSignal) => Promise<Value<K>>
  save: (change: Change<K>) => Promise<SaveResult<Value<K>>>
}

/** The row's state, whether writes are known offline, and the switch's tap with its asked value. */
export function useAccountSwitch<K extends string>({
  field,
  statusKey,
  changesKey,
  read: readSaved,
  save: requestSave,
}: AccountSwitch<K>) {
  const client = useQueryClient()
  const offline = useKnownOffline()
  const latest = useMutationState<Attempt<K>>({
    filters: { mutationKey: changesKey },
    select: (mutation) => mutation.state as Attempt<K>,
  }).at(-1)
  const attempted = latest?.variables
  const saving = latest?.status === 'pending'
  const problem = latest?.data?.problem

  const read = useQuery({
    queryKey: statusKey,
    queryFn: ({ signal }) => readSaved(signal),
  })
  const saved = read.data?.[field]

  const save = useMutation({
    mutationKey: changesKey,
    mutationFn: requestSave,
    async onSuccess(result) {
      if (result.problem === 'unconfirmed') {
        await client.invalidateQueries({ queryKey: statusKey })
        return
      }
      if (!result.saved) return
      // A read that started before the save must not overwrite its confirmation.
      await client.cancelQueries({ queryKey: statusKey })
      client.setQueryData(statusKey, result.saved)
    },
  })

  function change(on: boolean) {
    if (saving || offline) return
    const retry = problem === 'unconfirmed' && attempted?.[field] === on
    save.mutate({
      [field]: on,
      actionId: retry && attempted ? attempted.actionId : crypto.randomUUID(),
    } as Change<K>)
  }

  const state = ((): AccountSwitchState => {
    if (saving && attempted) return attempted[field] ? 'turning-on' : 'turning-off'
    if (saved === undefined) return 'loading'
    // A failed attempt shows only while the saved value still differs from it.
    if (problem && attempted && attempted[field] !== saved) {
      if (problem === 'unconfirmed') return saved ? 'off-unconfirmed' : 'unconfirmed'
      return saved ? 'off-rejected' : 'rejected'
    }
    return saved ? 'on' : 'off'
  })()

  return { state, offline, change }
}
