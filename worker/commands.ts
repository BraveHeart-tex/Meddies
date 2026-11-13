import { parseMedicine, type MedicineCommand } from '../src/features/medicines/contract'
import {
  isScheduleDate,
  parseSchedule,
  parseScheduleEdit,
  parseScheduleStop,
  parseSchedulePause,
  parseTakenDose,
  parseSkippedDose,
  parseDoseCorrection,
  type ScheduleCommand,
} from '../src/features/schedules/contract'
import { ApplicationError } from '../src/lib/application-error'

export type WorkerCommand =
  | { path: '/medicines'; command: MedicineCommand }
  | {
      path: '/schedules'
      command:
        | Exclude<ScheduleCommand, { operation: 'save' }>
        | { operation: 'save'; ownerId: string; schedule: ReturnType<typeof parseSchedule> }
    }

// Decode domain fields only after the service capability, route and owner checks.
// Shared parsers retain defaults, ignored extra fields and legacy accepted inputs.
export function decodeCommand(path: '/medicines' | '/schedules', value: unknown): WorkerCommand {
  const input = value as Record<string, unknown> | null
  if (!input || typeof input.ownerId !== 'string' || !/^google:.{1,248}$/.test(input.ownerId))
    throw new ApplicationError('validation', 400)
  const ownerId = input.ownerId
  if (path === '/medicines') {
    switch (input.operation) {
      case 'list':
        return { path, command: { operation: 'list', ownerId } }
      case 'save':
        return {
          path,
          command: { operation: 'save', ownerId, medicine: parseMedicine(input.medicine) },
        }
      default:
        throw new ApplicationError('validation', 400)
    }
  }
  switch (input.operation) {
    case 'list':
    case 'listOutcomes': {
      if (input.date !== undefined && !isScheduleDate(input.date))
        throw new ApplicationError('validation', 400)
      if (input.operation === 'listOutcomes') {
        if (input.date === undefined) throw new ApplicationError('validation', 400)
        return { path, command: { operation: 'listOutcomes', ownerId, date: input.date } }
      }
      return { path, command: { operation: 'list', ownerId, date: input.date } }
    }
    case 'save':
      return {
        path,
        command: { operation: 'save', ownerId, schedule: parseSchedule(input.schedule) },
      }
    case 'pause':
      return {
        path,
        command: { operation: 'pause', ownerId, pause: parseSchedulePause(input.pause) },
      }
    case 'stop':
      return { path, command: { operation: 'stop', ownerId, stop: parseScheduleStop(input.stop) } }
    case 'edit':
      return { path, command: { operation: 'edit', ownerId, edit: parseScheduleEdit(input.edit) } }
    case 'recordTaken':
      return {
        path,
        command: { operation: 'recordTaken', ownerId, record: parseTakenDose(input.record) },
      }
    case 'recordSkipped':
      return {
        path,
        command: { operation: 'recordSkipped', ownerId, record: parseSkippedDose(input.record) },
      }
    case 'correctOutcome':
      return {
        path,
        command: {
          operation: 'correctOutcome',
          ownerId,
          correction: parseDoseCorrection(input.correction),
        },
      }
    default:
      throw new ApplicationError('validation', 400)
  }
}
