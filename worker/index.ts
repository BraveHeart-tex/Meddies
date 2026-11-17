import { drizzle } from 'drizzle-orm/d1'
import { decodeCommand } from './commands'
import {
  authenticateService,
  commandPath,
  failure,
  isSchedulerRequest,
  json,
  readJsonRequest,
} from './http'
import {
  listMedicines,
  saveMedicine,
  editMedicine,
  archiveMedicine,
  restoreMedicine,
  deleteMedicine,
} from './medicines'
import { listLegacySnapshot, listOutcomeSnapshot, saveSchedule, editSchedule } from './schedules'
import { correctDoseOutcome, recordSkipped, recordTaken } from './doses/mutations'
import { writeUnscheduledDose } from './doses/unscheduled'
import {
  readDeviceRegistration,
  removeDeviceRegistration,
  renewDeviceRegistration,
  saveDeviceRegistration,
} from './device-registrations'
import { runDueReminders, type ReminderProvider } from './due-reminders'
import { createFcmProvider } from './fcm'
import { ApplicationError } from '../src/lib/application-error'

type Env = {
  DB: D1Database
  MEDICINES_WORKER_SECRET: string
  SCHEDULER_SECRET?: string
  FCM_PROJECT_ID?: string
  FCM_CLIENT_EMAIL?: string
  FCM_PRIVATE_KEY?: string
}

// Without every FCM secret the run stops before claiming, so no reminder is spent on it.
function fcmProvider({ FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY }: Env) {
  if (!FCM_PROJECT_ID || !FCM_CLIENT_EMAIL || !FCM_PRIVATE_KEY)
    throw new ApplicationError('unavailable', 503)
  return createFcmProvider({
    projectId: FCM_PROJECT_ID,
    clientEmail: FCM_CLIENT_EMAIL,
    privateKey: FCM_PRIVATE_KEY,
  })
}

/**
 * The cron trigger (`worker/wrangler.jsonc`, every minute) and the scheduler command for the
 * approved external scheduler run the same due-reminder operation. The scheduler command
 * authenticates with its own `SCHEDULER_SECRET`, never the Next.js capability, and answers counts
 * only. One reminder provider serves the isolate, so its FCM access token is reused across runs.
 */
export function createWorker(
  clock: () => Date = () => new Date(),
  reminderProvider: (env: Env) => ReminderProvider = fcmProvider,
) {
  let provider: ReminderProvider | undefined
  const dueReminders = (env: Env) =>
    runDueReminders(drizzle(env.DB), (provider ??= reminderProvider(env)), clock)
  return {
    async scheduled(_controller: unknown, env: Env): Promise<void> {
      try {
        await dueReminders(env)
      } catch {
        // A fixed message fails the run without logging query or provider detail.
        throw new Error('due_reminder_failure')
      }
    },
    async fetch(request: Request, env: Env): Promise<Response> {
      try {
        if (isSchedulerRequest(request)) {
          await authenticateService(request, env.SCHEDULER_SECRET)
          const { submitted, dropped, retrying } = await dueReminders(env)
          return json({ submitted, dropped, retrying })
        }
        await authenticateService(request, env.MEDICINES_WORKER_SECRET)
        const path = commandPath(request)
        if (path instanceof Response) return path
        const decoded = decodeCommand(path, await readJsonRequest(request))
        const db = drizzle(env.DB)
        if (decoded.path === '/medicines') {
          const command = decoded.command
          switch (command.operation) {
            case 'correctDetails':
              return json(await editMedicine(db, command.ownerId, command.correction, clock()))
            case 'changeStrength':
              return json(await editMedicine(db, command.ownerId, command.change, clock()))
            case 'archive':
              return json(await archiveMedicine(db, command.ownerId, command.archive, clock()))
            case 'restore':
              return json(await restoreMedicine(db, command.ownerId, command.restore, clock()))
            case 'delete':
              return json(await deleteMedicine(db, command.ownerId, command.deletion, clock()))
            case 'list':
              return json(await listMedicines(db, command.ownerId))
            case 'save':
              return json(await saveMedicine(db, command.ownerId, command.medicine))
          }
        }
        if (decoded.path === '/device-registrations') {
          const command = decoded.command
          switch (command.operation) {
            case 'save':
              return json(
                await saveDeviceRegistration(db, command.ownerId, command.registration, clock()),
              )
            case 'renew':
              return json(
                await renewDeviceRegistration(db, command.ownerId, command.registration, clock()),
              )
            case 'remove':
              return json(await removeDeviceRegistration(db, command.ownerId, command.installation))
            case 'read':
              return json(await readDeviceRegistration(db, command.ownerId, command.installation))
          }
        }
        const command = decoded.command
        switch (command.operation) {
          case 'saveUnscheduled':
            return json({
              unscheduledDoses: [
                await writeUnscheduledDose(db, command.ownerId, command.dose, clock()),
              ],
            })
          case 'changeUnscheduled':
            return json({
              unscheduledDoses: [
                await writeUnscheduledDose(db, command.ownerId, command.change, clock()),
              ],
            })
          case 'list':
            return json(await listLegacySnapshot(db, command.ownerId, command.date))
          case 'listOutcomes':
            return json(await listOutcomeSnapshot(db, command.ownerId, command.date))
          case 'save':
            return json(await saveSchedule(db, command.ownerId, command.schedule, clock))
          case 'resume':
            return json(await editSchedule(db, command.ownerId, command.resume, clock, 'resume'))
          case 'pause':
            return json(await editSchedule(db, command.ownerId, command.pause, clock, 'pause'))
          case 'stop':
            return json(await editSchedule(db, command.ownerId, command.stop, clock))
          case 'edit':
            return json(await editSchedule(db, command.ownerId, command.edit, clock))
          case 'recordTaken':
            return json({
              records: [await recordTaken(db, command.ownerId, command.record, clock())],
            })
          case 'recordSkipped':
            return json({
              records: [await recordSkipped(db, command.ownerId, command.record, clock())],
            })
          case 'correctOutcome':
            return json({
              records: [await correctDoseOutcome(db, command.ownerId, command.correction, clock())],
            })
        }
      } catch (error) {
        return failure(error)
      }
    },
  } satisfies ExportedHandler<Env>
}

export default createWorker()
