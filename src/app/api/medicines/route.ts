import { readJsonRequest } from '@/lib/json-request'
import { medicines } from '@/features/medicines/server'
import { json, failure, mutationGuard } from '@/lib/http'

export const runtime = 'nodejs'

export async function GET() {
  try {
    return json({ medicines: await medicines.list() })
  } catch (error) {
    return failure(error, 'medicine_request_failure')
  }
}

export async function POST(request: Request) {
  const rejected = mutationGuard(request)
  if (rejected) return rejected
  try {
    const input = await readJsonRequest(request)
    return json({ medicines: await medicines.save(input) })
  } catch (error) {
    return failure(error, 'medicine_request_failure')
  }
}
