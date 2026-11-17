import { readJsonRequest } from '@/lib/json-request'
import { quietHours } from '@/features/quiet-hours/server'
import { json, failure, mutationGuard } from '@/lib/http'

export const runtime = 'nodejs'

// GET reads the account's Quiet hours; PUT sets them with `{ actionId, quietHours }`.
// Every response is `{ quietHours }` or `{ error }`.
export async function GET() {
  try {
    return json(await quietHours.read())
  } catch (error) {
    return failure(error, 'quiet_hours_request_failure')
  }
}

export async function PUT(request: Request) {
  const rejected = mutationGuard(request)
  if (rejected) return rejected
  try {
    return json(await quietHours.set(await readJsonRequest(request)))
  } catch (error) {
    return failure(error, 'quiet_hours_request_failure')
  }
}
