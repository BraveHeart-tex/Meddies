import { readJsonRequest } from '@/lib/json-request'
import { schedules } from '@/features/schedules/server'
import { json, failure, mutationGuard } from '@/lib/http'

export const runtime = 'nodejs'

async function mutate(request: Request, operation: (input: unknown) => Promise<unknown>) {
  const rejected = mutationGuard(request)
  if (rejected) return rejected
  try {
    return json({ dose: await operation(await readJsonRequest(request)) })
  } catch (error) {
    return failure(error, 'unscheduled_dose_request_failure')
  }
}

export async function POST(request: Request) {
  return mutate(request, schedules.saveUnscheduled)
}

// removed:true appends a removal revision; removed:false changes time and quantity.
export async function PATCH(request: Request) {
  return mutate(request, schedules.changeUnscheduled)
}
