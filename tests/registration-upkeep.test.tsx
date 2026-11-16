import { http, HttpResponse } from 'msw'
import { afterEach, expect, test, vi } from 'vitest'
import type { NotificationDevice } from '../src/features/device-registrations/notification-device'
import {
  keepRegistrationCurrent,
  registeredInstallation,
} from '../src/features/device-registrations/registration-upkeep'
import { server } from './helpers/msw-server'

const installationId = 'cTestInstallation0001x'
const endpoint = '/api/device-registration'

afterEach(() => localStorage.clear())

function launchDevice(permission: NotificationPermission, token: string) {
  return {
    support: () => 'browser',
    permission: () => permission,
    requestPermission: vi.fn(async () => permission),
    installation: vi.fn(async () => ({ installationId })),
    registration: vi.fn(async () => ({ installationId, token })),
  } satisfies NotificationDevice
}

/** Records each renew and remove body, answering `registered`. */
function writes(registered: boolean) {
  const renewals: unknown[] = []
  const removals: unknown[] = []
  server.use(
    http.patch(endpoint, async ({ request }) => {
      renewals.push(await request.json())
      return HttpResponse.json({ registered })
    }),
    http.delete(endpoint, async ({ request }) => {
      removals.push(await request.json())
      return HttpResponse.json({ registered: false })
    }),
  )
  return { renewals, removals }
}

test('a signed-in launch with permission granted renews the registration with the changed token', async () => {
  registeredInstallation.set({ installationId })
  const changed = `${installationId}:APA91b-changed-token-0002`
  const { renewals, removals } = writes(true)

  await keepRegistrationCurrent(launchDevice('granted', changed))

  expect(renewals).toEqual([{ installationId, token: changed }])
  expect(removals).toEqual([])
  expect(registeredInstallation.get()).toEqual({ installationId })
})

test.each(['denied', 'default'] as const)(
  'a launch after permission was revoked to %s removes the registration',
  async (permission) => {
    registeredInstallation.set({ installationId })
    const { renewals, removals } = writes(true)
    const device = launchDevice(permission, 'unused')

    await keepRegistrationCurrent(device)

    expect(removals).toEqual([{ installationId }])
    expect(renewals).toEqual([])
    expect(device.registration).not.toHaveBeenCalled()
    expect(registeredInstallation.get()).toBeUndefined()
  },
)

test('a launch on a device that never turned notifications on sends nothing', async () => {
  const { renewals, removals } = writes(true)
  const device = launchDevice('granted', 'unused')

  await keepRegistrationCurrent(device)

  expect([...renewals, ...removals]).toEqual([])
  expect(device.registration).not.toHaveBeenCalled()
})
