import { schedules } from '@/features/schedules/server'
import { failure, json } from '@/lib/http'

export const runtime = 'nodejs'

/** One History date's doses for the signed-in owner (`?date=YYYY-MM-DD`, up to today). */
export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get('date')
    return json(await schedules.historySnapshot(date))
  } catch (error) {
    return failure(error, 'schedule_request_failure')
  }
}
