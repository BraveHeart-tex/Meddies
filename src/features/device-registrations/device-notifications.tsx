'use client'

/**
 * Settings' Notifications group for this device (#354). The case comes from the device, and On
 * only from the server: a read of this installation's registration, or a confirmed Turn on save.
 * Nothing is optimistic. Turn on asks for permission from the switch's tap, gets the FCM token
 * and saves the Device registration. A denied prompt is Blocked and a dismissed one stays Off,
 * with nothing saved. A save that might not have saved keeps its registration, and the next tap
 * resends it unchanged. Turn on saves live in the session's mutation cache, so a pending save and
 * its failure survive navigation. A failed read shows Off: turning on again re-saves the same
 * installation and confirms On. Turn off, launch renewal and Sign out belong to #355.
 */
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type MutationState,
} from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { useKnownOffline } from '@/lib/use-known-offline'
import type { DeviceRegistration } from './contract'
import { useNotificationDevice, type NotificationDevice } from './notification-device'
import { NotificationsGroup, type NotificationState } from './notifications-group'
import { deviceRegistrationKeys, fetchDeviceRegistration, saveDeviceRegistration } from './queries'

type TurnOnInput = {
  /** Requested from the tap, before the mutation starts. */
  permission: Promise<NotificationPermission>
  /** The registration an unconfirmed save sent, resent unchanged. */
  retry?: DeviceRegistration
}

type TurnOnOutcome =
  | { kind: 'on' | 'blocked' | 'dismissed' | 'rejected' }
  | { kind: 'unconfirmed'; registration: DeviceRegistration }

async function turnOn(
  device: NotificationDevice,
  { permission, retry }: TurnOnInput,
): Promise<TurnOnOutcome> {
  const granted = await permission
  if (granted === 'denied') return { kind: 'blocked' }
  if (granted !== 'granted') return { kind: 'dismissed' }
  let registration = retry
  if (!registration) {
    try {
      registration = await device.registration()
    } catch {
      // No token means nothing reached Meddies' server.
      return { kind: 'rejected' }
    }
  }
  const result = await saveDeviceRegistration(registration)
  if (result.saved?.registered) return { kind: 'on' }
  if (result.problem === 'unconfirmed') return { kind: 'unconfirmed', registration }
  return { kind: 'rejected' }
}

const noSubscription = () => () => {}

export function DeviceNotifications() {
  const device = useNotificationDevice()
  const client = useQueryClient()
  const offline = useKnownOffline()
  // The server render can't know the device; the row shows Checking until hydrated.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  )
  const support = hydrated ? device.support() : undefined
  const receives = support === 'browser' || support === 'iphone'
  const permission = receives ? device.permission() : undefined

  const turnOnKey = deviceRegistrationKeys.turnOn()
  const latest = useMutationState<MutationState<TurnOnOutcome, Error, TurnOnInput>>({
    filters: { mutationKey: turnOnKey },
    select: (mutation) => mutation.state as MutationState<TurnOnOutcome, Error, TurnOnInput>,
  }).at(-1)
  const saving = latest?.status === 'pending'
  const outcome = latest?.data

  const read = useQuery({
    queryKey: deviceRegistrationKeys.status(),
    queryFn: async ({ signal }) => fetchDeviceRegistration(await device.installation(), signal),
    enabled: permission === 'granted' && !saving,
  })

  const save = useMutation({
    mutationKey: turnOnKey,
    mutationFn: (input: TurnOnInput) => turnOn(device, input),
    async onSuccess(result) {
      if (result.kind !== 'on') return
      // A read that started before the save must not overwrite its confirmation.
      await client.cancelQueries({ queryKey: deviceRegistrationKeys.status() })
      client.setQueryData(deviceRegistrationKeys.status(), { registered: true })
    },
  })

  function tapped() {
    if (saving || offline) return
    const current = device.permission()
    const requested = current === 'default' ? device.requestPermission() : Promise.resolve(current)
    save.mutate({
      permission: requested,
      retry: outcome?.kind === 'unconfirmed' ? outcome.registration : undefined,
    })
  }

  const state = ((): NotificationState => {
    if (!support) return 'checking'
    if (support === 'unsupported' || support === 'home-screen') return support
    if (saving) return 'turning-on'
    if (permission === 'denied') return support === 'iphone' ? 'blocked-iphone' : 'blocked-android'
    if (permission === 'granted') {
      if (read.data?.registered) return 'on'
      if (read.isPending && !outcome) return 'checking'
    }
    if (outcome?.kind === 'unconfirmed') return 'unconfirmed'
    if (outcome?.kind === 'rejected') return 'rejected'
    return 'off'
  })()

  return <NotificationsGroup state={state} offline={offline} onTurnOn={tapped} />
}
