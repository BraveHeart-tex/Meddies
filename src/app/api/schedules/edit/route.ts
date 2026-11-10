import { readJsonRequest } from '@/lib/json-request'
import { schedules } from '@/features/schedules/server'
import { json, failure, mutationGuard } from '@/lib/http'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const rejected = mutationGuard(request)
  if (rejected) return rejected
  try {
    return json({ schedules: await schedules.edit(await readJsonRequest(request)) })
  } catch (error) {
    return failure(error, 'schedule_edit_request_failure')
  }
}
