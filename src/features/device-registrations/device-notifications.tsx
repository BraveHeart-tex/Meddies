'use client'

/**
 * Settings' This device row (#354). The case comes from the device, and On
 * only from the server: a read of this installation's registration, or a confirmed Turn on save.
 * Nothing is optimistic. Turn on asks for permission from the switch's tap, gets the FCM token
 * and saves the Device registration. A denied prompt is Blocked and a dismissed one stays Off,
 * with nothing saved. A save that might not have saved keeps its registration, and the next tap
 * resends it unchanged. Turn on saves live in the session's mutation cache, so a pending save and
 * its failure survive navigation. A failed read shows Off: turning on again re-saves the same
 * installation and confirms On. Turn off (#355) is the switch on On: it removes this
 * installation's registration and shows Off only after the server confirms; until then On stays
 * with the same save feedback. Turn on and Turn off share one mutation key, so the latest attempt
 * wins. A confirmed state also updates the browser's remembered installation (registration-upkeep).
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
import type { DeviceInstallation, DeviceRegistration } from './contract'
import { useNotificationDevice, type NotificationDevice } from './notification-device'
import { DeviceNotificationsRow, type NotificationState } from './device-notifications-row'
import {
  deviceRegistrationKeys,
  fetchDeviceRegistration,
  removeDeviceRegistration,
  saveDeviceRegistration,
} from './queries'
import { registeredInstallation } from './registration-upkeep'

type ChangeInput =
  | {
      action: 'on'
      /** Requested from the tap, before the mutation starts. */
      permission: Promise<NotificationPermission>
      /** The registration an unconfirmed save sent, resent unchanged. */
      retry?: DeviceRegistration
    }
  | { action: 'off' }

type ChangeOutcome =
  | { kind: 'on' | 'off' | 'blocked' | 'dismissed' | 'rejected' | 'off-rejected' }
  | { kind: 'unconfirmed'; registration: DeviceRegistration }
  | { kind: 'off-unconfirmed' }

async function turnOn(
  device: NotificationDevice,
  { permission, retry }: Extract<ChangeInput, { action: 'on' }>,
): Promise<ChangeOutcome> {
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
  if (result.saved?.registered) {
    registeredInstallation.set(registration)
    return { kind: 'on' }
  }
  if (result.problem === 'unconfirmed') return { kind: 'unconfirmed', registration }
  return { kind: 'rejected' }
}

/** Removing is idempotent, so a retry after an unconfirmed removal just sends it again. */
async function turnOff(device: NotificationDevice): Promise<ChangeOutcome> {
  let installation: DeviceInstallation
  try {
    installation = await device.installation()
  } catch {
    return { kind: 'off-rejected' }
  }
  const result = await removeDeviceRegistration(installation)
  if (result.saved) {
    registeredInstallation.clear(installation)
    return { kind: 'off' }
  }
  return { kind: result.problem === 'unconfirmed' ? 'off-unconfirmed' : 'off-rejected' }
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

  const changesKey = deviceRegistrationKeys.changes()
  const latest = useMutationState<MutationState<ChangeOutcome, Error, ChangeInput>>({
    filters: { mutationKey: changesKey },
    select: (mutation) => mutation.state as MutationState<ChangeOutcome, Error, ChangeInput>,
  }).at(-1)
  const saving = latest?.status === 'pending'
  const turningOff = saving && latest?.variables?.action === 'off'
  const outcome = latest?.data

  const read = useQuery({
    queryKey: deviceRegistrationKeys.status(),
    queryFn: async ({ signal }) => {
      const installation = await device.installation()
      const status = await fetchDeviceRegistration(installation, signal)
      if (status.registered) registeredInstallation.set(installation)
      else registeredInstallation.clear(installation)
      return status
    },
    enabled: permission === 'granted' && !saving,
  })

  const save = useMutation({
    mutationKey: changesKey,
    mutationFn: (input: ChangeInput) =>
      input.action === 'on' ? turnOn(device, input) : turnOff(device),
    async onSuccess(result) {
      if (result.kind !== 'on' && result.kind !== 'off') return
      // A read that started before the save must not overwrite its confirmation.
      await client.cancelQueries({ queryKey: deviceRegistrationKeys.status() })
      client.setQueryData(deviceRegistrationKeys.status(), { registered: result.kind === 'on' })
    },
  })

  function turnOnTapped() {
    if (saving || offline) return
    const current = device.permission()
    const requested = current === 'default' ? device.requestPermission() : Promise.resolve(current)
    save.mutate({
      action: 'on',
      permission: requested,
      retry: outcome?.kind === 'unconfirmed' ? outcome.registration : undefined,
    })
  }

  function turnOffTapped() {
    if (saving || offline) return
    save.mutate({ action: 'off' })
  }

  const state = ((): NotificationState => {
    if (!support) return 'checking'
    if (support === 'unsupported' || support === 'home-screen') return support
    if (turningOff) return 'turning-off'
    if (saving) return 'turning-on'
    if (permission === 'denied') return support === 'iphone' ? 'blocked-iphone' : 'blocked-android'
    if (permission === 'granted') {
      if (read.data?.registered) {
        if (outcome?.kind === 'off-unconfirmed') return 'off-unconfirmed'
        if (outcome?.kind === 'off-rejected') return 'off-rejected'
        return 'on'
      }
      if (read.isPending && !outcome) return 'checking'
    }
    if (outcome?.kind === 'unconfirmed') return 'unconfirmed'
    if (outcome?.kind === 'rejected') return 'rejected'
    return 'off'
  })()

  return (
    <DeviceNotificationsRow
      state={state}
      offline={offline}
      onTurnOn={turnOnTapped}
      onTurnOff={turnOffTapped}
    />
  )
}
