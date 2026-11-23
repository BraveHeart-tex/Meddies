import { typeCorrectionBodyLimit } from '../src/features/medicines/type-correction-contract'
import { correctMedicineType, reviewMedicineType } from './medicine-type-correction'
import { DrizzleQueryError } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { decodeCommand, type WorkerCommand } from './commands'
import {
  authenticateService,
  commandPath,
  type CommandPath,
  failure,
  isSchedulerRequest,
  json,
  readJsonRequest,
} from './http'
import {
  listMedicines,
  setMedicineStock,
  saveMedicine,
  editMedicine,
  archiveMedicine,
  restoreMedicine,
  deleteMedicine,
} from './medicines'
import { listOutcomeSnapshot, saveSchedule, editSchedule } from './schedules'
import { correctDoseOutcome, recordSkipped, recordTaken } from './doses/mutations'
import { writeUnscheduledDose } from './doses/unscheduled'
import { readDoseHistory } from './doses/history'
import {
  readDeviceRegistration,
  removeDeviceRegistration,
  renewDeviceRegistration,
  saveDeviceRegistration,
} from './device-registrations'
import { readQuietHours, setQuietHours } from './quiet-hours'
import { readMedicationNames, setMedicationNames } from './medication-names'
import { snoozeDose } from './snoozes'
import {
  HEALTHY_RUN_CALLS,
  isHealthyRun,
  runDueReminders,
  type ReminderProvider,
} from './due-reminders'
import { activateRefillPushes, runRefillPushes, type RefillProvider } from './refill-pushes'
import { D1_CALL_LIMIT, meterD1 } from './d1-budget'
import { createFcmProvider } from './fcm'
import { ApplicationError } from '../src/lib/application-error'

// Drizzle wraps execution failures; D1 can also fail while preparing a statement.
// Inspect only the runtime's fixed prefix, never copy its message or query into an event.
type FailureCause = 'storage' | 'unexpected' | null
function failureCause(error: unknown): FailureCause {
  if (error instanceof ApplicationError) return null
  if (
    error instanceof DrizzleQueryError ||
    (error instanceof Error && error.message.startsWith('D1_ERROR:'))
  )
    return 'storage'
  return 'unexpected'
}

type Env = {
  DB: D1Database
  MEDICINES_WORKER_SECRET: string
  MEDICINES_WORKER_SECRET_PREVIOUS?: string
  HEARTBEAT_URL?: string
  SCHEDULER_SECRET?: string
  FCM_PROJECT_ID?: string
  FCM_CLIENT_EMAIL?: string
  FCM_PRIVATE_KEY?: string
}

type RunContext = { waitUntil(promise: Promise<unknown>): void }

// Keep the bare heartbeat outside the run lifetime. Bound even a fetch that never settles;
// failures are deliberately silent so neither the secret nor provider text reaches logs.
// Redirects are never followed; Workers supports only 'follow' and 'manual', and throws on 'error'.
async function pingHeartbeat(url: string) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      fetch(url, { signal: controller.signal, redirect: 'manual' }).then((response) =>
        response.body?.cancel(),
      ),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          controller.abort()
          resolve()
        }, 5_000)
      }),
    ])
  } catch {
    // The external check detects missing pings; a ping failure never fails the run.
  } finally {
    clearTimeout(timer)
  }
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
 * approved external scheduler run dose reminders and refill pushes. The scheduler command
 * authenticates with its own `SCHEDULER_SECRET`, never the Next.js capability, and answers counts
 * only. One reminder provider serves the isolate, so its FCM access token is reused across runs.
 * Each command and each started run emits one allowlisted event. Never log raw input or errors;
 * only decoded operation names, known paths, safe error codes and causes cross the
 * logging boundary.
 * Settlement failures count failed instants. Failed run delivery counts stay unknown
 * because earlier submissions may already have happened.
 * Only a Healthy run pings HEARTBEAT_URL, without data, in deferred bounded work.
 * One D1 budget (worker/d1-budget.ts) spans the run: refill activation, dose reminders, refill
 * pushes and, reserved up front, the Healthy run check.
 */
export function createWorker(
  clock: () => Date = () => new Date(),
  reminderProvider: (env: Env) => ReminderProvider & Partial<RefillProvider> = fcmProvider,
) {
  let provider: (ReminderProvider & Partial<RefillProvider>) | undefined
  const runScheduler = async (env: Env, origin: 'cron' | 'command', context?: RunContext) => {
    const started = performance.now()
    const event = {
      kind: 'scheduler',
      origin,
      status: 'failed',
      errorCode: null as ApplicationError['code'] | 'internal' | null,
      cause: null as FailureCause,
      submitted: null as number | null,
      dropped: null as number | null,
      retrying: null as number | null,
      settlementFailures: 0,
      durationMs: 0,
    }
    try {
      provider ??= reminderProvider(env)
      const { submitRefill } = provider
      const d1 = meterD1(env.DB)
      const reserved = env.HEARTBEAT_URL ? HEALTHY_RUN_CALLS : 0
      const admits = (calls: number) => d1.used() + calls + reserved <= D1_CALL_LIMIT
      if (submitRefill) await activateRefillPushes(d1.db)
      const run = await runDueReminders(
        drizzle(d1.db),
        provider,
        clock,
        undefined,
        () => {
          event.settlementFailures++
        },
        admits,
      )
      if (submitRefill)
        await runRefillPushes(d1.db, { submitRefill: submitRefill.bind(provider) }, clock, admits)
      if (env.HEARTBEAT_URL && (await isHealthyRun(drizzle(d1.db), clock()))) {
        const ping = pingHeartbeat(env.HEARTBEAT_URL)
        context?.waitUntil(ping)
      }
      event.status = 'completed'
      event.submitted = run.submitted
      event.dropped = run.dropped
      event.retrying = run.retrying
      return run
    } catch (error) {
      event.errorCode = error instanceof ApplicationError ? error.code : 'internal'
      event.cause = failureCause(error)
      throw error
    } finally {
      event.durationMs = performance.now() - started
      console.log(event)
    }
  }
  type CommandEvent = {
    kind: 'command'
    path: CommandPath | '/due-reminders' | null
    operation: WorkerCommand['command']['operation'] | 'run' | null
    status: number
    errorCode: ApplicationError['code'] | 'internal' | null
    cause: FailureCause
    durationMs: number
  }
  const handleCommand = async (
    request: Request,
    env: Env,
    event: CommandEvent,
    context?: RunContext,
  ): Promise<Response> => {
    try {
      if (isSchedulerRequest(request)) {
        event.path = '/due-reminders'
        event.operation = 'run'
        await authenticateService(request, env.SCHEDULER_SECRET)
        const { submitted, dropped, retrying } = await runScheduler(env, 'command', context)
        return json({ submitted, dropped, retrying })
      }
      await authenticateService(
        request,
        env.MEDICINES_WORKER_SECRET,
        env.MEDICINES_WORKER_SECRET_PREVIOUS,
      )
      const path = commandPath(request)
      if (path instanceof Response) {
        event.errorCode = 'not_found'
        return path
      }
      const decoded = decodeCommand(
        path,
        await readJsonRequest(
          request,
          // Next.js adds the operation and authenticated owner to the public request.
          path === '/medicine-type-correction' ? typeCorrectionBodyLimit + 2048 : undefined,
        ),
      )
      event.operation = decoded.command.operation
      const db = drizzle(env.DB)
      if (decoded.path === '/medicine-type-correction') {
        const command = decoded.command
        return command.operation === 'reviewTypeCorrection'
          ? json({ review: await reviewMedicineType(db, command.ownerId, command.review) })
          : json(await correctMedicineType(db, command.ownerId, command.correction, clock()))
      }
      if (decoded.path === '/medicines') {
        const command = decoded.command
        switch (command.operation) {
          case 'correctDetails':
            return json(await editMedicine(db, command.ownerId, command.correction, clock()))
          case 'changeStrength':
            return json(await editMedicine(db, command.ownerId, command.change, clock()))
          case 'archive':
            return json(await archiveMedicine(db, command.ownerId, command.archive, clock()))
          case 'stockOn':
          case 'stockOff':
          case 'stockCorrection':
          case 'stockRefill':
          case 'stockThreshold':
            return json(
              await setMedicineStock(
                db,
                command.ownerId,
                command.operation,
                command.stock,
                clock(),
              ),
            )
          case 'restore':
            return json(await restoreMedicine(db, command.ownerId, command.restore, clock()))
          case 'delete':
            return json(await deleteMedicine(db, command.ownerId, command.deletion, clock()))
          case 'list':
            return json(await listMedicines(db, command.ownerId))
          case 'save':
            return json(await saveMedicine(db, command.ownerId, command.medicine, clock()))
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
      if (decoded.path === '/medication-names') {
        const command = decoded.command
        switch (command.operation) {
          case 'read':
            return json(await readMedicationNames(db, command.ownerId))
          case 'set':
            return json(await setMedicationNames(db, command.ownerId, command.change, clock()))
        }
      }
      if (decoded.path === '/snoozes') {
        const { ownerId, request } = decoded.command
        return json(await snoozeDose(db, ownerId, request, clock()))
      }
      if (decoded.path === '/dose-history') {
        const { ownerId, medicineId, before } = decoded.command
        return json(await readDoseHistory(db, ownerId, { medicineId, before }, clock()))
      }
      if (decoded.path === '/quiet-hours') {
        const command = decoded.command
        switch (command.operation) {
          case 'read':
            return json(await readQuietHours(db, command.ownerId))
          case 'set':
            return json(await setQuietHours(db, command.ownerId, command.change, clock()))
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
      event.errorCode = error instanceof ApplicationError ? error.code : 'internal'
      event.cause = failureCause(error)
      return failure(error)
    }
  }
  return {
    async scheduled(_controller: unknown, env: Env, context?: RunContext): Promise<void> {
      try {
        await runScheduler(env, 'cron', context)
      } catch (error) {
        // Fail the trigger with only the safe code, never query or provider detail.
        throw new Error(error instanceof ApplicationError ? error.code : 'internal')
      }
    },
    async fetch(request: Request, env: Env, context?: RunContext): Promise<Response> {
      const started = performance.now()
      const path = commandPath(request)
      const event: CommandEvent = {
        kind: 'command',
        path: path instanceof Response ? null : path,
        operation: null,
        status: 500,
        errorCode: null,
        cause: null,
        durationMs: 0,
      }
      const response = await handleCommand(request, env, event, context)
      event.status = response.status
      event.durationMs = performance.now() - started
      console.log(event)
      return response
    },
  } satisfies ExportedHandler<Env>
}

export default createWorker()
