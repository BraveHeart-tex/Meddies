import 'server-only'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { ApplicationError } from '../../lib/application-error'
import { parseDeviceRegistrationStatus, type DeviceRegistrationCommand } from './contract'
import { createDeviceRegistrationOperations } from './operations'

export async function send(command: DeviceRegistrationCommand) {
  try {
    return parseDeviceRegistrationStatus(await sendStorage('/device-registrations', command))
  } catch (error) {
    if (error instanceof ApplicationError) throw error
    console.error('device_registration_gateway_failure')
    throw new ApplicationError('unavailable', 503)
  }
}

export const deviceRegistrations = createDeviceRegistrationOperations({
  async requireUser() {
    try {
      return await requireUser()
    } catch {
      throw new ApplicationError('unauthorized', 401)
    }
  },
  send,
})
