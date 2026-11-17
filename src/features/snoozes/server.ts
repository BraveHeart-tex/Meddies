import 'server-only'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { ApplicationError } from '../../lib/application-error'
import { parseSnoozeResult, type SnoozeCommand } from './contract'
import { createSnoozeOperations } from './operations'

export async function send(command: SnoozeCommand) {
  try {
    return parseSnoozeResult(await sendStorage('/snoozes', command))
  } catch (error) {
    if (error instanceof ApplicationError) throw error
    console.error('snooze_gateway_failure')
    throw new ApplicationError('unavailable', 503)
  }
}

export const snoozes = createSnoozeOperations({
  async requireUser() {
    try {
      return await requireUser()
    } catch {
      throw new ApplicationError('unauthorized', 401)
    }
  },
  send,
})
