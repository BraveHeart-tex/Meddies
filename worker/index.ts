import { drizzle } from 'drizzle-orm/d1'
import { decodeCommand } from './commands'
import { authenticateService, commandPath, failure, json, readJsonRequest } from './http'
import { listMedicines, saveMedicine } from './medicines'
import { listLegacySnapshot, listOutcomeSnapshot, saveSchedule, editSchedule } from './schedules'
import { correctDoseOutcome, recordSkipped, recordTaken } from './doses/mutations'

type Env = { DB: D1Database; MEDICINES_WORKER_SECRET: string }

export function createWorker(clock: () => Date = () => new Date()) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      try {
        await authenticateService(request, env.MEDICINES_WORKER_SECRET)
        const path = commandPath(request)
        if (path instanceof Response) return path
        const decoded = decodeCommand(path, await readJsonRequest(request))
        const db = drizzle(env.DB)
        if (decoded.path === '/medicines') {
          const command = decoded.command
          switch (command.operation) {
            case 'list':
              return json(await listMedicines(db, command.ownerId))
            case 'save':
              return json(await saveMedicine(db, command.ownerId, command.medicine))
          }
        }
        const command = decoded.command
        switch (command.operation) {
          case 'list':
            return json(await listLegacySnapshot(db, command.ownerId, command.date))
          case 'listOutcomes':
            return json(await listOutcomeSnapshot(db, command.ownerId, command.date))
          case 'save':
            return json(await saveSchedule(db, command.ownerId, command.schedule, clock))
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
