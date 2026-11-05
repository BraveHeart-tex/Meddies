import { readJsonRequest } from '@/lib/json-request'
import { schedules } from '@/features/schedules/server'
import { MedicineError } from '@/features/medicines/contract'

export const runtime = 'nodejs'
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

function failure(error: unknown) {
  if (error instanceof MedicineError) return json({ error: error.code }, error.status)
  console.error('schedule_request_failure')
  return json({ error: 'unavailable' }, 503)
}

export async function GET() {
  try {
    return json(await schedules.snapshot())
  } catch (error) {
    return failure(error)
  }
}

async function mutate(request: Request, operation: (input: unknown) => Promise<unknown>) {
  // Cookie-authenticated mutations require an exact same-origin browser request.
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return json({ error: 'forbidden' }, 403)
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    return json({ error: 'validation' }, 415)
  try {
    const input = await readJsonRequest(request)
    return json(await operation(input))
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  return mutate(request, async (input) => ({ schedules: await schedules.save(input) }))
}

export async function PUT(request: Request) {
  return mutate(request, async (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new MedicineError('validation', 400)
    const value = input as Record<string, unknown>
    if (value.outcome === 'Skipped') {
      if (
        Object.keys(value).some(
          (key) => !['outcome', 'scheduleId', 'dueAt', 'ownerId'].includes(key),
        )
      )
        throw new MedicineError('validation', 400)
      return { record: await schedules.recordSkipped(value) }
    }
    if (value.outcome !== undefined && value.outcome !== 'Taken')
      throw new MedicineError('validation', 400)
    return { record: await schedules.recordTaken(value) }
  })
}

export async function PATCH(request: Request) {
  return mutate(request, async (input) => ({ record: await schedules.correctOutcome(input) }))
}
