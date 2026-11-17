import 'server-only'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { ApplicationError } from '../../lib/application-error'
import { parseQuietHours, type QuietHoursCommand } from './contract'
import { createQuietHoursOperations } from './operations'

export async function send(command: QuietHoursCommand) {
  try {
    return parseQuietHours(await sendStorage('/quiet-hours', command))
  } catch (error) {
    if (error instanceof ApplicationError) throw error
    console.error('quiet_hours_gateway_failure')
    throw new ApplicationError('unavailable', 503)
  }
}

export const quietHours = createQuietHoursOperations({
  async requireUser() {
    try {
      return await requireUser()
    } catch {
      throw new ApplicationError('unauthorized', 401)
    }
  },
  send,
})
