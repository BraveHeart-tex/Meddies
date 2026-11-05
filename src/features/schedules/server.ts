import 'server-only'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { MedicineError } from '@/features/medicines/contract'
import {
  isInstant,
  parseSchedule,
  parseTakenDose,
  type ScheduleCommand,
  type ScheduleResponse,
} from './contract'
import { createScheduleOperations } from './operations'

async function send(command: ScheduleCommand): Promise<ScheduleResponse> {
  const data = await sendStorage('/schedules', command)
  try {
    const result: ScheduleResponse = {}
    if (command.operation !== 'recordTaken') {
      if (!Array.isArray(data.schedules)) throw new Error('contract')
      result.schedules = data.schedules.map((value: unknown) => {
        const schedule = parseSchedule(value)
        const confirmedAt = (value as Record<string, unknown>).confirmedAt
        if (!isInstant(confirmedAt)) throw new Error('contract')
        return { ...schedule, confirmedAt }
      })
    }
    if (command.operation !== 'save') {
      if (!Array.isArray(data.records)) throw new Error('contract')
      result.records = data.records.map((value: unknown) => {
        const record = parseTakenDose(value)
        if ((value as Record<string, unknown>).outcome !== 'Taken') throw new Error('contract')
        return { ...record, outcome: 'Taken' }
      })
    }
    return result
  } catch {
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
