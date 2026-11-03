import 'server-only'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { MedicineError } from '@/features/medicines/contract'
import { parseSchedule, type ScheduleCommand } from './contract'
import { createScheduleOperations } from './operations'

async function send(command: ScheduleCommand) {
  try {
    const data = await sendStorage('/schedules', command)
    if (!Array.isArray(data.schedules)) throw new Error('contract')
    return data.schedules.map((value: unknown) => {
      let schedule
      try {
        schedule = parseSchedule(value)
      } catch {
        throw new Error('contract')
      }
      const confirmedAt = (value as Record<string, unknown>).confirmedAt
      if (typeof confirmedAt !== 'string' || new Date(confirmedAt).toJSON() !== confirmedAt)
        throw new Error('contract')
      return { ...schedule, confirmedAt }
    })
  } catch (error) {
    if (error instanceof MedicineError) throw error
    console.error('schedule_gateway_failure')
    throw new MedicineError('unavailable', 503)
  }
}
export const schedules = createScheduleOperations({
  async requireUser() {
    try {
      return await requireUser()
    } catch {
      throw new MedicineError('unauthorized', 401)
    }
  },
  send,
})
