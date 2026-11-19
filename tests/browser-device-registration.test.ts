import { describe, expect, it, vi } from 'vitest'
import { parseDeviceRegistration } from '../src/features/device-registrations/contract'
import { registerDevice, syntheticDeviceRegistration } from './browser/device-registration'

// Catches the #397 capture failure: a hand-written installation ID rejected with HTTP 400.
describe('browser Device registration helper', () => {
  it('builds distinct registrations the contract parser accepts', () => {
    const first = syntheticDeviceRegistration()
    const second = syntheticDeviceRegistration('second-device')
    expect(parseDeviceRegistration(first)).toEqual(first)
    expect(parseDeviceRegistration(second)).toEqual(second)
    expect(second.installationId).not.toBe(first.installationId)
  })

  it('registers through the authenticated Device registration API', async () => {
    const api = vi.fn().mockResolvedValue(undefined)
    const registration = await registerDevice({ api })
    expect(api).toHaveBeenCalledWith('PUT', '/api/device-registration', registration)
  })
})
