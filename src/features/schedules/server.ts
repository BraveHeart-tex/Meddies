import 'server-only'
import { readFileSync } from 'node:fs'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { MedicineError } from '@/features/medicines/contract'
import {
  isInstant,
  parseDoseOutcomeRecord,
  parseSchedule,
  parseTakenDose,
  type ScheduleCommand,
  type ScheduleResponse,
} from './contract'
import { createScheduleOperations } from './operations'

export function schedulingNow(): Date {
  const clockFile = process.env.MEDDIES_BROWSER_CLOCK_FILE
  return clockFile ? new Date(readFileSync(clockFile, 'utf8')) : new Date()
}

async function send(command: ScheduleCommand): Promise<ScheduleResponse> {
  const data = await sendStorage('/schedules', command)
  try {
    const result: ScheduleResponse = {}
    if (
      command.operation !== 'recordTaken' &&
      command.operation !== 'recordSkipped' &&
      command.operation !== 'correctOutcome'
    ) {
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
      result.records = data.records.map((value: unknown) =>
        command.operation === 'list' || command.operation === 'recordTaken'
          ? (() => {
              const record = parseTakenDose(value)
              if ((value as Record<string, unknown>).outcome !== 'Taken')
                throw new Error('contract')
              return { ...record, outcome: 'Taken' as const }
            })()
          : parseDoseOutcomeRecord(value),
      )
    }
    return result
  } catch {
    console.error('schedule_gateway_failure')
    throw new MedicineError('unavailable', 503)
  }
}
export const schedules = createScheduleOperations({
  now: schedulingNow,
  async requireUser() {
    try {
      return await requireUser()
    } catch {
      throw new MedicineError('unauthorized', 401)
    }
  },
  send,
})
