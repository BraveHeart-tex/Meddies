import {
  parseUnscheduledDose,
  parseUnscheduledDoseChange,
} from '../src/features/unscheduled-doses/contract'
import {
  parseMedicine,
  parseStockOn,
  parseStockCorrection,
  parseStockRefill,
  parseStockThreshold,
  parseStockOff,
  parseDetailCorrection,
  parseStrengthChange,
  parseMedicineArchive,
  parseMedicineRestore,
  parseMedicineDelete,
  type MedicineCommand,
} from '../src/features/medicines/contract'
import {
  type TypeCorrectionCommand,
  parseTypeCorrection,
  parseTypeCorrectionReviewInput,
} from '../src/features/medicines/type-correction-contract'
import {
  isScheduleDate,
  parseSchedule,
  parseScheduleEdit,
  parseScheduleStop,
  parseSchedulePause,
  parseScheduleResume,
  parseTakenDose,
  parseSkippedDose,
  parseDoseCorrection,
  type ScheduleCommand,
} from '../src/features/schedules/contract'
import {
  parseDeviceInstallation,
  parseDeviceRegistration,
  type DeviceRegistrationCommand,
} from '../src/features/device-registrations/contract'
import { parseQuietHoursChange, type QuietHoursCommand } from '../src/features/quiet-hours/contract'
import {
  parseMedicationNamesChange,
  type MedicationNamesCommand,
} from '../src/features/medication-names/contract'
import { parseSnoozeRequest, type SnoozeCommand } from '../src/features/snoozes/contract'
import {
  parseDoseHistoryRequest,
  type DoseHistoryCommand,
} from '../src/features/dose-history/contract'
import { ApplicationError } from '../src/lib/application-error'
import type { CommandPath } from './http'

export type WorkerCommand =
  | { path: '/medicines'; command: MedicineCommand }
  | { path: '/medicine-type-correction'; command: TypeCorrectionCommand }
  | {
      path: '/schedules'
      command:
        | Exclude<ScheduleCommand, { operation: 'save' }>
        | { operation: 'save'; ownerId: string; schedule: ReturnType<typeof parseSchedule> }
    }
  | { path: '/device-registrations'; command: DeviceRegistrationCommand }
  | { path: '/quiet-hours'; command: QuietHoursCommand }
  | { path: '/medication-names'; command: MedicationNamesCommand }
  | { path: '/snoozes'; command: SnoozeCommand }
  | { path: '/dose-history'; command: DoseHistoryCommand }

// Decode domain fields only after the service capability, route and owner checks.
// Shared parsers retain defaults, ignored extra fields and legacy accepted inputs.
export function decodeCommand(path: CommandPath, value: unknown): WorkerCommand {
  const input = value as Record<string, unknown> | null
  if (!input || typeof input.ownerId !== 'string' || !/^google:.{1,248}$/.test(input.ownerId))
    throw new ApplicationError('validation', 400)
  const ownerId = input.ownerId
  if (path === '/dose-history') {
    if (input.operation !== 'read') throw new ApplicationError('validation', 400)
    return { path, command: { operation: 'read', ownerId, ...parseDoseHistoryRequest(input) } }
  }
  if (path === '/medication-names') {
    switch (input.operation) {
      case 'read':
        return { path, command: { operation: 'read', ownerId } }
      case 'set':
        return {
          path,
          command: {
            operation: 'set',
            ownerId,
            change: parseMedicationNamesChange(input.change),
          },
        }
      default:
        throw new ApplicationError('validation', 400)
    }
  }
  if (path === '/snoozes') {
    if (input.operation !== 'snooze') throw new ApplicationError('validation', 400)
    return {
      path,
      command: { operation: 'snooze', ownerId, request: parseSnoozeRequest(input.request) },
    }
  }
  if (path === '/quiet-hours') {
    switch (input.operation) {
      case 'read':
        return { path, command: { operation: 'read', ownerId } }
      case 'set':
        return {
          path,
          command: { operation: 'set', ownerId, change: parseQuietHoursChange(input.change) },
        }
      default:
        throw new ApplicationError('validation', 400)
    }
  }
  if (path === '/device-registrations') {
    switch (input.operation) {
      case 'save':
      case 'renew':
        return {
          path,
          command: {
            operation: input.operation,
            ownerId,
            registration: parseDeviceRegistration(input.registration),
          },
        }
      case 'remove':
      case 'read':
        return {
          path,
          command: {
            operation: input.operation,
            ownerId,
            installation: parseDeviceInstallation(input.installation),
          },
        }
      default:
        throw new ApplicationError('validation', 400)
    }
  }
  if (path === '/medicine-type-correction') {
    if (input.operation === 'reviewTypeCorrection')
      return {
        path,
        command: {
          operation: input.operation,
          ownerId,
          review: parseTypeCorrectionReviewInput(input.review),
        },
      }
    if (input.operation === 'correctType')
      return {
        path,
        command: {
          operation: input.operation,
          ownerId,
          correction: parseTypeCorrection(input.correction),
        },
      }
    throw new ApplicationError('validation', 400)
  }
  if (path === '/medicines') {
    switch (input.operation) {
      case 'correctDetails':
        return {
          path,
          command: {
            operation: 'correctDetails',
            ownerId,
            correction: parseDetailCorrection(input.correction),
          },
        }
      case 'changeStrength':
        return {
          path,
          command: {
            operation: 'changeStrength',
            ownerId,
            change: parseStrengthChange(input.change),
          },
        }
      case 'archive':
        return {
          path,
          command: { operation: 'archive', ownerId, archive: parseMedicineArchive(input.archive) },
        }
      case 'stockOn':
        return {
          path,
          command: { operation: 'stockOn', ownerId, stock: parseStockOn(input.stock) },
        }
      case 'stockOff':
        return {
          path,
          command: { operation: 'stockOff', ownerId, stock: parseStockOff(input.stock) },
        }
      case 'stockThreshold':
        return {
          path,
          command: {
            operation: 'stockThreshold',
            ownerId,
            stock: parseStockThreshold(input.stock),
          },
        }
      case 'stockRefill':
        return {
          path,
          command: { operation: 'stockRefill', ownerId, stock: parseStockRefill(input.stock) },
        }
      case 'stockCorrection':
        return {
          path,
          command: {
            operation: 'stockCorrection',
            ownerId,
            stock: parseStockCorrection(input.stock),
          },
        }
      case 'restore':
        return {
          path,
          command: { operation: 'restore', ownerId, restore: parseMedicineRestore(input.restore) },
        }
      case 'delete':
        return {
          path,
          command: { operation: 'delete', ownerId, deletion: parseMedicineDelete(input.deletion) },
        }
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
    case 'saveUnscheduled':
      return {
        path,
        command: { operation: 'saveUnscheduled', ownerId, dose: parseUnscheduledDose(input.dose) },
      }
    case 'changeUnscheduled':
      return {
        path,
        command: {
          operation: 'changeUnscheduled',
          ownerId,
          change: parseUnscheduledDoseChange(input.change),
        },
      }
    case 'listOutcomes': {
      if (!isScheduleDate(input.date)) throw new ApplicationError('validation', 400)
      return { path, command: { operation: 'listOutcomes', ownerId, date: input.date } }
    }
    case 'save':
      return {
        path,
        command: { operation: 'save', ownerId, schedule: parseSchedule(input.schedule) },
      }
    case 'resume':
      return {
        path,
        command: { operation: 'resume', ownerId, resume: parseScheduleResume(input.resume) },
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
