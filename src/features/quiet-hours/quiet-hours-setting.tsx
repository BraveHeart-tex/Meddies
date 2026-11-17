'use client'

/**
 * Settings' Quiet hours group (#381). The value is account-wide, so On and Off come only from the
 * server: a read of the saved value, or a confirmed save. Nothing is optimistic, so a failed read
 * keeps the placeholder, with no switch, until a focus or reconnect read succeeds. Each tap is one
 * attempt with its own action ID; a retry of a save that might not have saved resends the same
 * change with the same action ID, so the Worker returns the original outcome. A save that might
 * not have saved rereads the saved value, and its alert goes once the read shows the change.
 * Saves live in the session's mutation cache, so a pending save and its failure survive
 * navigation, and Turn on and Turn off share one mutation key so the latest attempt wins.
 */
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type MutationState,
} from '@tanstack/react-query'
import { useKnownOffline } from '@/lib/use-known-offline'
import type { SaveResult } from '@/lib/session-saves'
import type { QuietHours, QuietHoursChange } from './contract'
import { QuietHoursGroup, type QuietHoursState } from './quiet-hours-group'
import { fetchQuietHours, quietHoursKeys, saveQuietHours } from './queries'

type Attempt = MutationState<SaveResult<QuietHours>, Error, QuietHoursChange>

export function QuietHoursSetting() {
  const client = useQueryClient()
  const offline = useKnownOffline()
  const changesKey = quietHoursKeys.changes()
  const latest = useMutationState<Attempt>({
    filters: { mutationKey: changesKey },
    select: (mutation) => mutation.state as Attempt,
  }).at(-1)
  const attempted = latest?.variables
  const saving = latest?.status === 'pending'
  const problem = latest?.data?.problem

  const read = useQuery({
    queryKey: quietHoursKeys.status(),
    queryFn: ({ signal }) => fetchQuietHours(signal),
  })
  const saved = read.data?.quietHours

  const save = useMutation({
    mutationKey: changesKey,
    mutationFn: saveQuietHours,
    async onSuccess(result) {
      if (result.problem === 'unconfirmed') {
        await client.invalidateQueries({ queryKey: quietHoursKeys.status() })
        return
      }
      if (!result.saved) return
      // A read that started before the save must not overwrite its confirmation.
      await client.cancelQueries({ queryKey: quietHoursKeys.status() })
      client.setQueryData(quietHoursKeys.status(), result.saved)
    },
  })

  function changeTapped(quietHours: boolean) {
    if (saving || offline) return
    const retry = problem === 'unconfirmed' && attempted?.quietHours === quietHours
    save.mutate({
      quietHours,
      actionId: retry && attempted ? attempted.actionId : crypto.randomUUID(),
    })
  }

  const state = ((): QuietHoursState => {
    if (saving && attempted) return attempted.quietHours ? 'turning-on' : 'turning-off'
    if (saved === undefined) return 'loading'
    // A failed attempt shows only while the saved value still differs from it.
    if (problem && attempted && attempted.quietHours !== saved) {
      if (problem === 'unconfirmed') return saved ? 'off-unconfirmed' : 'unconfirmed'
      return saved ? 'off-rejected' : 'rejected'
    }
    return saved ? 'on' : 'off'
  })()

  return <QuietHoursGroup state={state} offline={offline} onChange={changeTapped} />
}
