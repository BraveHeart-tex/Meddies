import { doseHistory } from '@/features/dose-history/server'
import { failure, json } from '@/lib/http'

export const runtime = 'nodejs'

/**
 * One medication's Dose history page for the signed-in owner
 * (`?medicineId=<uuid>&before=YYYY-MM-DD`, `before` from the previous page). An unknown or another
 * owner's medication is 404 `{ error: 'not_found' }`.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    return json(
      await doseHistory.read({
        medicineId: params.get('medicineId'),
        before: params.get('before'),
      }),
    )
  } catch (error) {
    return failure(error, 'dose_history_request_failure')
  }
}
