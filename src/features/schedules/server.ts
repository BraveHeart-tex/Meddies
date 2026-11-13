import 'server-only'
import { readFileSync } from 'node:fs'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { ApplicationError } from '@/lib/application-error'
import {
  isInstant,
  isScheduleDate,
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
        const anchorDate = (value as Record<string, unknown>).anchorDate
        if (anchorDate != null && !isScheduleDate(anchorDate)) throw new Error('contract')
        const pausedAt = (value as Record<string, unknown>).pausedAt
        if (pausedAt != null && !isInstant(pausedAt)) throw new Error('contract')
        const stoppedAt = (value as Record<string, unknown>).stoppedAt
        if (stoppedAt != null && !isInstant(stoppedAt)) throw new Error('contract')
        const replacedAt = (value as Record<string, unknown>).replacedAt
        if (replacedAt != null && !isInstant(replacedAt)) throw new Error('contract')
        const basedOnId = (value as Record<string, unknown>).basedOnId
        if (basedOnId != null && typeof basedOnId !== 'string') throw new Error('contract')
        return {
          ...schedule,
          confirmedAt,
          ...(anchorDate === undefined ? {} : { anchorDate: anchorDate as string | null }),
          ...(pausedAt === undefined ? {} : { pausedAt: pausedAt as string | null }),
          ...(stoppedAt === undefined ? {} : { stoppedAt: stoppedAt as string | null }),
          ...(basedOnId === undefined ? {} : { basedOnId: basedOnId as string | null }),
          ...(replacedAt === undefined ? {} : { replacedAt: replacedAt as string | null }),
        }
      })
    }
    if (
      command.operation !== 'save' &&
      command.operation !== 'edit' &&
      command.operation !== 'stop' &&
      command.operation !== 'pause' &&
      command.operation !== 'resume'
    ) {
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
