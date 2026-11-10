import { scheduleHistoryDay, scheduleToday } from './occurrences'
import {
  istanbulDate,
  isScheduleDate,
  parseSchedule,
  parseScheduleEdit,
  parseDoseOutcome,
  parseDoseCorrection,
  parseSkippedDose,
  parseTakenDose,
  type SendSchedule,
} from './contract'
import { ApplicationError } from '../../lib/application-error'

export function createScheduleOperations(dependencies: {
  requireUser: () => Promise<{ id: string }>
  send: SendSchedule
  now?: () => Date
}) {
  const operations = {
    async save(input: unknown) {
      const user = await dependencies.requireUser()
      const schedule = parseSchedule(input)
      const response = await dependencies.send({ operation: 'save', ownerId: user.id, schedule })
      if (!response.schedules) throw new ApplicationError('unavailable', 503)
      return response.schedules
    },
    async edit(input: unknown) {
      const user = await dependencies.requireUser()
      const edit = parseScheduleEdit(input)
      const response = await dependencies.send({ operation: 'edit', ownerId: user.id, edit })
      if (
        !response.schedules ||
        response.schedules.length !== 1 ||
        response.schedules[0].id !== edit.id
      )
        throw new ApplicationError('unavailable', 503)
      return response.schedules
    },
    async recordOutcome(input: unknown) {
      // Preserve PUT precedence: outcome/Skipped fields before authentication,
      // then authenticate before parsing the occurrence and intake details.
      const outcome = parseDoseOutcome(input)
      return outcome === 'Skipped' ? operations.recordSkipped(input) : operations.recordTaken(input)
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
        throw new ApplicationError('unavailable', 503)
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
        throw new ApplicationError('unavailable', 503)
      return saved
    },
    async correctOutcome(input: unknown) {
      const user = await dependencies.requireUser()
      const correction = parseDoseCorrection(input)
      const response = await dependencies.send({
        operation: 'correctOutcome',
        ownerId: user.id,
        correction,
      })
      const saved = response.records?.[0]
      if (
        !saved ||
        saved.outcome !== correction.outcome ||
        saved.scheduleId !== correction.scheduleId ||
        saved.dueAt !== correction.dueAt ||
        saved.revision !== correction.expectedRevision + 1 ||
        saved.actionId !== correction.actionId ||
        (correction.outcome === 'Taken' &&
          (saved.outcome !== 'Taken' ||
            saved.takenAt !== correction.takenAt ||
            saved.quantity !== correction.quantity))
      )
        throw new ApplicationError('unavailable', 503)
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
      if (!schedules || !records) throw new ApplicationError('unavailable', 503)
      return {
        schedules: schedules.filter((schedule) => !schedule.replacedAt),
        earlierSchedules: schedules.filter((schedule) => schedule.replacedAt),
        records,
        today: scheduleToday(schedules, now, records),
      }
    },
    async history(date: unknown) {
      const user = await dependencies.requireUser()
      const now = dependencies.now?.() ?? new Date()
      if (!isScheduleDate(date) || date > istanbulDate(now))
        throw new ApplicationError('validation', 400)
      const { schedules, records } = await dependencies.send({
        operation: 'listOutcomes',
        ownerId: user.id,
        date,
      })
      if (!schedules || !records) throw new ApplicationError('unavailable', 503)
      return scheduleHistoryDay(schedules, date, now, records)
    },
  }
  return operations
}
