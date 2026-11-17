import { readJsonRequest } from '@/lib/json-request'
import { snoozes } from '@/features/snoozes/server'
import { json, failure, mutationGuard } from '@/lib/http'

export const runtime = 'nodejs'

// POST snoozes a Not logged dose with `{ actionId, scheduleId, dueAt }`. The response is
// `{ outcome: 'snoozed' | 'dropped', targetAt }`, `{ outcome: 'rejected', reason }` or `{ error }`.
export async function POST(request: Request) {
  const rejected = mutationGuard(request)
  if (rejected) return rejected
  try {
    return json(await snoozes.snooze(await readJsonRequest(request)))
  } catch (error) {
    return failure(error, 'snooze_request_failure')
  }
}
