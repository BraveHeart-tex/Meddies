import 'server-only'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { ApplicationError } from '../../lib/application-error'
import { parseDoseHistory, type DoseHistoryCommand } from './contract'
import { createDoseHistoryOperations } from './operations'

export async function send(command: DoseHistoryCommand) {
  try {
    return parseDoseHistory(await sendStorage('/dose-history', command))
  } catch (error) {
    if (error instanceof ApplicationError) throw error
    console.error('dose_history_gateway_failure')
    throw new ApplicationError('unavailable', 503)
  }
}

export const doseHistory = createDoseHistoryOperations({
  async requireUser() {
    try {
      return await requireUser()
    } catch {
      throw new ApplicationError('unauthorized', 401)
    }
  },
  send,
})
