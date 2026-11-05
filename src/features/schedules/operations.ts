import { scheduleToday } from './occurrences'
import {
  istanbulDate,
  parseSchedule,
  parseSkippedDose,
  parseTakenDose,
  type ScheduleCommand,
  type ScheduleResponse,
} from './contract'
import { MedicineError } from '../medicines/contract'

export function createScheduleOperations(dependencies: {
  requireUser: () => Promise<{ id: string }>
  send: (command: ScheduleCommand) => Promise<ScheduleResponse>
  now?: () => Date
}) {
  return {
    async save(input: unknown) {
      const user = await dependencies.requireUser()
      const schedule = parseSchedule(input)
      const response = await dependencies.send({ operation: 'save', ownerId: user.id, schedule })
      if (!response.schedules) throw new MedicineError('unavailable', 503)
      return response.schedules
    },
    async recordTaken(input: unknown) {
      const user = await dependencies.requireUser()
      const record = parseTakenDose(input)
      const response = await dependencies.send({
        operation: 'recordTaken',
        ownerId: user.id,
        record,
      })
      const saved = response.records?.[0]
      if (
        !saved ||
        saved.outcome !== 'Taken' ||
        saved.scheduleId !== record.scheduleId ||
        saved.dueAt !== record.dueAt
      )
        throw new MedicineError('unavailable', 503)
      return saved
    },
    async recordSkipped(input: unknown) {
      const user = await dependencies.requireUser()
      const record = parseSkippedDose(input)
      const response = await dependencies.send({
        operation: 'recordSkipped',
        ownerId: user.id,
        record,
      })
      const saved = response.records?.[0]
      if (
        !saved ||
        saved.outcome !== 'Skipped' ||
        saved.scheduleId !== record.scheduleId ||
        saved.dueAt !== record.dueAt
      )
        throw new MedicineError('unavailable', 503)
      return saved
    },
    async snapshot() {
      const user = await dependencies.requireUser()
      const now = dependencies.now?.() ?? new Date()
      const { schedules, records } = await dependencies.send({
        operation: 'listOutcomes',
        ownerId: user.id,
        date: istanbulDate(now),
      })
      if (!schedules || !records) throw new MedicineError('unavailable', 503)
      return { schedules, records, today: scheduleToday(schedules, now, records) }
    },
  }
}
