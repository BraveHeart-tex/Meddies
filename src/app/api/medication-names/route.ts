import { readJsonRequest } from '@/lib/json-request'
import { medicationNames } from '@/features/medication-names/server'
import { json, failure, mutationGuard } from '@/lib/http'

export const runtime = 'nodejs'

// GET reads the account's Medication names; PUT sets them with `{ actionId, medicationNames }`.
// Every response is `{ medicationNames }` or `{ error }`.
export async function GET() {
  try {
    return json(await medicationNames.read())
  } catch (error) {
    return failure(error, 'medication_names_request_failure')
  }
}

export async function PUT(request: Request) {
  const rejected = mutationGuard(request)
  if (rejected) return rejected
  try {
    return json(await medicationNames.set(await readJsonRequest(request)))
  } catch (error) {
    return failure(error, 'medication_names_request_failure')
  }
}
