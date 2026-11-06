import { readJsonRequest } from '@/lib/json-request'
import { schedules } from '@/features/schedules/server'
import { json, failure, mutationGuard } from '@/lib/http'

export const runtime = 'nodejs'

export async function GET() {
  try {
    return json(await schedules.snapshot())
  } catch (error) {
    return failure(error, 'schedule_request_failure')
  }
}

async function mutate(request: Request, operation: (input: unknown) => Promise<unknown>) {
  const rejected = mutationGuard(request)
  if (rejected) return rejected
  try {
    const input = await readJsonRequest(request)
    return json(await operation(input))
  } catch (error) {
    return failure(error, 'schedule_request_failure')
  }
}

export async function POST(request: Request) {
  return mutate(request, async (input) => ({ schedules: await schedules.save(input) }))
}

export async function PUT(request: Request) {
  return mutate(request, async (input) => ({ record: await schedules.recordOutcome(input) }))
}

export async function PATCH(request: Request) {
  return mutate(request, async (input) => ({ record: await schedules.correctOutcome(input) }))
}
