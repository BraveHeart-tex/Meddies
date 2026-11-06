import 'server-only'
import { readFileSync } from 'node:fs'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { ApplicationError } from '@/lib/application-error'
import {
  isInstant,
  parseDoseOutcomeRecord,
  parseSchedule,
  parseTakenDose,
  type ScheduleCommand,
  type ScheduleResponse,
  type DailySchedule,
  type DoseOutcomeRecord,
} from './contract'
import { createScheduleOperations } from './operations'

export function schedulingNow(): Date {
  const clockFile = process.env.MEDDIES_BROWSER_CLOCK_FILE
  return clockFile ? new Date(readFileSync(clockFile, 'utf8')) : new Date()
}

export async function send<C extends ScheduleCommand>(command: C): Promise<ScheduleResponse<C>> {
  const data = (await sendStorage('/schedules', command)) as {
    schedules?: unknown
    records?: unknown
  }
  try {
    const result: { schedules?: DailySchedule[]; records?: DoseOutcomeRecord[] } = {}
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
    return result as ScheduleResponse<C>
  } catch {
    console.error('schedule_gateway_failure')
    throw new ApplicationError('unavailable', 503)
  }
}
export const schedules = createScheduleOperations({
  now: schedulingNow,
  async requireUser() {
    try {
      return await requireUser()
    } catch {
      throw new ApplicationError('unauthorized', 401)
    }
  },
  send,
})
