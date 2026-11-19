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

export async function PATCH(request: Request) {
  const rejected = mutationGuard(request)
  if (rejected) return rejected
  try {
    const input = (await readJsonRequest(request)) as Record<string, unknown>
    if (input?.operation === 'stockOn')
      return json({ medicines: await medicines.stockOn(input.stock) })
    if (input?.operation === 'stockOff')
      return json({ medicines: await medicines.stockOff(input.stock) })
    if (input?.operation === 'stockCorrection')
      return json({ medicines: await medicines.stockCorrection(input.stock) })
    if (input?.operation === 'delete')
      return json({ deletion: await medicines.delete(input.deletion) })
    if (input?.operation === 'correctDetails')
      return json({ medicines: await medicines.correctDetails(input.correction) })
    if (input?.operation === 'changeStrength')
      return json({ medicines: await medicines.changeStrength(input.change) })
    if (input?.operation === 'restore')
      return json({ medicines: await medicines.restore(input.restore) })
    if (input?.operation === 'archive')
      return json({ medicines: await medicines.archive(input.archive) })
    return json({ error: 'validation' }, 400)
  } catch (error) {
    return failure(error, 'medicine_request_failure')
  }
}
