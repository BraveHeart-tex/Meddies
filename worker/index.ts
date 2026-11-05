import { drizzle } from 'drizzle-orm/d1'
import { and, eq, asc } from 'drizzle-orm'
import { dailySchedules, userMedications } from './schema'
import { MedicineError, parseMedicine } from '../src/features/medicines/contract'

import {
  correctDoseOutcome,
  listDoseOutcomes,
  listDoseRecords,
  recordSkipped,
  recordTaken,
} from './dose-records'
import { isScheduleDate, istanbulDate, parseSchedule } from '../src/features/schedules/contract'

type Env = { DB: D1Database; MEDICINES_WORKER_SECRET: string }
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export function createWorker(clock: () => Date = () => new Date()) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      if (!env.MEDICINES_WORKER_SECRET || env.MEDICINES_WORKER_SECRET.length < 32)
        return json({ error: 'unavailable' }, 503)
      // Compare fixed-length digests rather than secret strings with an early-return comparison.
      const digest = async (value: string) =>
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
      const [actual, expected] = await Promise.all([
        digest(request.headers.get('authorization') || ''),
        digest(`Bearer ${env.MEDICINES_WORKER_SECRET}`),
      ])
      let mismatch = 0
      for (let i = 0; i < actual.length; i++) mismatch |= actual[i] ^ expected[i]
      if (mismatch) return json({ error: 'unauthorized' }, 401)
      const path = new URL(request.url).pathname
      if (request.method !== 'POST' || !['/medicines', '/schedules'].includes(path))
        return json({ error: 'not_found' }, 404)
      try {
        // Bound bodies even when the caller uses chunked transfer.
        const reader = request.body?.getReader()
        if (!reader) return json({ error: 'validation' }, 400)
        let body = ''
        let bytes = 0
        const decoder = new TextDecoder()
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.byteLength
          if (bytes > 4096) {
            await reader.cancel()
            return json({ error: 'validation' }, 413)
          }
          body += decoder.decode(chunk.value, { stream: true })
        }
        body += decoder.decode()
        let command
        try {
          command = JSON.parse(body)
        } catch {
          return json({ error: 'validation' }, 400)
        }
        if (
          !command ||
          typeof command.ownerId !== 'string' ||
          !/^google:.{1,248}$/.test(command.ownerId)
        )
          return json({ error: 'validation' }, 400)
        const db = drizzle(env.DB)
        if (path === '/schedules') {
          const owner = eq(dailySchedules.ownerId, command.ownerId)
          const select = {
            id: dailySchedules.id,
            medicineId: dailySchedules.medicineId,
            startDate: dailySchedules.startDate,
            times: dailySchedules.times,
            confirmedAt: dailySchedules.confirmedAt,
            weekdays: dailySchedules.weekdays,
            endDate: dailySchedules.endDate,
          }
          if (command.operation === 'recordTaken') {
            return json({
              records: [await recordTaken(db, command.ownerId, command.record, clock())],
            })
          }
          if (command.operation === 'recordSkipped') {
            return json({
              records: [await recordSkipped(db, command.ownerId, command.record, clock())],
            })
          }
          if (command.operation === 'correctOutcome') {
            return json({
              records: [await correctDoseOutcome(db, command.ownerId, command.correction, clock())],
            })
          }
          if (command.operation === 'list' || command.operation === 'listOutcomes') {
            if (command.date !== undefined && !isScheduleDate(command.date))
              throw new MedicineError('validation', 400)
            if (command.operation === 'listOutcomes' && command.date === undefined)
              throw new MedicineError('validation', 400)
            const records =
              command.date === undefined
                ? undefined
                : command.operation === 'listOutcomes'
                  ? await listDoseOutcomes(db, command.ownerId, command.date)
                  : await listDoseRecords(db, command.ownerId, command.date)
            return json({
              records,
              schedules: await db
                .select(select)
                .from(dailySchedules)
                .where(owner)
                .orderBy(asc(dailySchedules.id)),
            })
          }
          if (command.operation !== 'save') throw new MedicineError('validation', 400)
          const schedule = parseSchedule(command.schedule)
          const existing = await db
            .select(select)
            .from(dailySchedules)
            .where(and(owner, eq(dailySchedules.id, schedule.id)))
            .get()
          const matches = (saved: typeof existing) =>
            saved &&
            saved.medicineId === schedule.medicineId &&
            saved.startDate === schedule.startDate &&
            JSON.stringify(saved.weekdays) === JSON.stringify(schedule.weekdays) &&
            saved.endDate === schedule.endDate &&
            JSON.stringify(saved.times) === JSON.stringify(schedule.times)
          // An identical retry remains valid after the initial start date has passed.
          if (existing) {
            if (!matches(existing)) throw new MedicineError('conflict', 409)
            return json({ schedules: [existing] })
          }
          const medicine = await db
            .select()
            .from(userMedications)
            .where(
              and(
                eq(userMedications.ownerId, command.ownerId),
                eq(userMedications.id, schedule.medicineId),
              ),
            )
            .get()
          if (
            !medicine ||
            (medicine.unit === 'capsule' &&
              schedule.times.some((slot) => !Number.isInteger(slot.quantity)))
          )
            throw new MedicineError('validation', 400)
          const now = clock()
          if (schedule.startDate < istanbulDate(now)) throw new MedicineError('validation', 400)
          await db
            .insert(dailySchedules)
            .values({ ...schedule, ownerId: command.ownerId, confirmedAt: now.toISOString() })
            .onConflictDoNothing()
          const saved = await db
            .select(select)
            .from(dailySchedules)
            .where(and(owner, eq(dailySchedules.id, schedule.id)))
            .get()
          if (!matches(saved)) throw new MedicineError('conflict', 409)
          return json({ schedules: [saved] })
        }
        const owner = eq(userMedications.ownerId, command.ownerId)
        if (command.operation === 'save') {
          const medicine = parseMedicine(command.medicine)
          await db
            .insert(userMedications)
            .values({ ...medicine, ownerId: command.ownerId })
            .onConflictDoNothing({ target: [userMedications.ownerId, userMedications.id] })
          const saved = await db
            .select()
            .from(userMedications)
            .where(and(owner, eq(userMedications.id, medicine.id)))
            .get()
          if (
            !saved ||
            saved.label !== medicine.label ||
            saved.strength !== medicine.strength ||
            saved.unit !== medicine.unit
          )
            throw new MedicineError('conflict', 409)
          return json({
            medicines: [
              { id: saved.id, label: saved.label, strength: saved.strength, unit: saved.unit },
            ],
          })
        }
        if (command.operation !== 'list') return json({ error: 'validation' }, 400)
        const medicines = await db
          .select({
            id: userMedications.id,
            label: userMedications.label,
            strength: userMedications.strength,
            unit: userMedications.unit,
          })
          .from(userMedications)
          .where(owner)
          .orderBy(asc(userMedications.label), asc(userMedications.id))
        return json({ medicines })
      } catch (error) {
        if (error instanceof MedicineError) return json({ error: error.code }, error.status)
        console.error('medicine_storage_failure')
        return json({ error: 'unavailable' }, 503)
      }
    },
  } satisfies ExportedHandler<Env>
}

export default createWorker()
