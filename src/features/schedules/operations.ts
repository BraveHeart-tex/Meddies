import { parseUnscheduledDose, parseUnscheduledDoseChange } from '../unscheduled-doses/contract'
import { scheduleHistoryDay, scheduleToday } from './occurrences'
import {
  istanbulDate,
  isScheduleDate,
  parseSchedule,
  parseScheduleEdit,
  parseScheduleStop,
  parseSchedulePause,
  parseScheduleResume,
  parseDoseOutcome,
  parseDoseCorrection,
  parseSkippedDose,
  parseTakenDose,
  type SendSchedule,
} from './contract'
import { ApplicationError } from '../../lib/application-error'
import { shiftDate } from '../../lib/calendar-date'

export function createScheduleOperations(dependencies: {
  requireUser: () => Promise<{ id: string }>
  send: SendSchedule
  now?: () => Date
}) {
  const operations = {
    async saveUnscheduled(input: unknown) {
      const user = await dependencies.requireUser()
      const dose = parseUnscheduledDose(input)
      const response = await dependencies.send({
        operation: 'saveUnscheduled',
        ownerId: user.id,
        dose,
      })
      const saved = response.unscheduledDoses[0]
      if (
        !saved ||
        response.unscheduledDoses.length !== 1 ||
        saved.id !== dose.actionId ||
        saved.actionId !== dose.actionId ||
        saved.medicineId !== dose.medicineId ||
        saved.takenAt !== dose.takenAt ||
        saved.quantity !== dose.quantity ||
        saved.revision !== 0 ||
        saved.removed
      )
        throw new ApplicationError('unavailable', 503)
      return saved
    },
    async changeUnscheduled(input: unknown) {
      const user = await dependencies.requireUser()
      const change = parseUnscheduledDoseChange(input)
      const response = await dependencies.send({
        operation: 'changeUnscheduled',
        ownerId: user.id,
        change,
      })
      const saved = response.unscheduledDoses[0]
      if (
        !saved ||
        response.unscheduledDoses.length !== 1 ||
        saved.id !== change.doseId ||
        saved.actionId !== change.actionId ||
        saved.revision !== change.expectedRevision + 1 ||
        saved.removed !== change.removed ||
        (!change.removed &&
          (saved.takenAt !== change.takenAt || saved.quantity !== change.quantity))
      )
        throw new ApplicationError('unavailable', 503)
      return saved
    },
    async save(input: unknown) {
      const user = await dependencies.requireUser()
      const schedule = parseSchedule(input)
      const response = await dependencies.send({ operation: 'save', ownerId: user.id, schedule })
      if (!response.schedules) throw new ApplicationError('unavailable', 503)
      return response.schedules
    },
    async resume(input: unknown) {
      const user = await dependencies.requireUser()
      const resume = parseScheduleResume(input)
      const response = await dependencies.send({ operation: 'resume', ownerId: user.id, resume })
      const saved = response.schedules?.[0]
      if (
        !saved ||
        response.schedules.length !== 1 ||
        saved.id !== resume.id ||
        saved.basedOnId !== resume.basedOnId ||
        saved.pausedAt ||
        saved.stoppedAt
      )
        throw new ApplicationError('unavailable', 503)
      return response.schedules
    },
    async pause(input: unknown) {
      const user = await dependencies.requireUser()
      const pause = parseSchedulePause(input)
      const response = await dependencies.send({ operation: 'pause', ownerId: user.id, pause })
      if (
        !response.schedules ||
        response.schedules.length !== 1 ||
        response.schedules[0].id !== pause.id ||
        !response.schedules[0].pausedAt ||
        response.schedules[0].pausedAt !== response.schedules[0].confirmedAt ||
        response.schedules[0].basedOnId !== pause.basedOnId
      )
        throw new ApplicationError('unavailable', 503)
      return response.schedules
    },
    async stop(input: unknown) {
      const user = await dependencies.requireUser()
      const stop = parseScheduleStop(input)
      const response = await dependencies.send({ operation: 'stop', ownerId: user.id, stop })
      if (
        !response.schedules ||
        response.schedules.length !== 1 ||
        response.schedules[0].id !== stop.id ||
        !response.schedules[0].stoppedAt
      )
        throw new ApplicationError('unavailable', 503)
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
      const date = istanbulDate(now)
      // Today's To log also lists yesterday's unresolved doses (#275), so it needs that date's
      // records too. A second read keeps the Worker command unchanged across deploys.
      const [
        { schedules, records: todayRecords, unscheduledDoses = [] },
        { records: yesterdayRecords },
      ] = await Promise.all([
        dependencies.send({ operation: 'listOutcomes', ownerId: user.id, date }),
        dependencies.send({
          operation: 'listOutcomes',
          ownerId: user.id,
          date: shiftDate(date, -1),
        }),
      ])
      if (!schedules || !todayRecords || !yesterdayRecords)
        throw new ApplicationError('unavailable', 503)
      const records = [...yesterdayRecords, ...todayRecords]
      return {
        schedules: schedules.filter((schedule) => !schedule.replacedAt),
        earlierSchedules: schedules.filter((schedule) => schedule.replacedAt),
        records,
        unscheduledDoses,
        today: scheduleToday(schedules, now, records),
      }
    },
    async history(date: unknown) {
      return (await operations.historySnapshot(date)).doses
    },
    async historySnapshot(date: unknown) {
      const user = await dependencies.requireUser()
      const now = dependencies.now?.() ?? new Date()
      if (!isScheduleDate(date) || date > istanbulDate(now))
        throw new ApplicationError('validation', 400)
      const {
        schedules,
        records,
        unscheduledDoses = [],
      } = await dependencies.send({
        operation: 'listOutcomes',
        ownerId: user.id,
        date,
      })
      if (!schedules || !records) throw new ApplicationError('unavailable', 503)
      return { doses: scheduleHistoryDay(schedules, date, now, records), unscheduledDoses }
    },
  }
  return operations
}
