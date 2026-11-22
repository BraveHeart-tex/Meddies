import { readJsonRequest } from '@/lib/json-request'
import { medicineTypeCorrection, typeCorrectionBodyLimit } from '@/features/medicines/server'
import { failure, json, mutationGuard } from '@/lib/http'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const rejected = mutationGuard(request)
  if (rejected) return rejected
  try {
    return json({ review: await medicineTypeCorrection.review(await readJsonRequest(request)) })
  } catch (error) {
    return failure(error, 'medicine_request_failure')
  }
}

export async function PATCH(request: Request) {
  const rejected = mutationGuard(request)
  if (rejected) return rejected
  try {
    const input = await readJsonRequest(request, typeCorrectionBodyLimit)
    return json({ medicines: await medicineTypeCorrection.correct(input) })
  } catch (error) {
    return failure(error, 'medicine_request_failure')
  }
}
