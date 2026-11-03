import { medicines } from '@/features/medicines/server'
import { MedicineError } from '@/features/medicines/contract'

export const runtime = 'nodejs'
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

function failure(error: unknown) {
  if (error instanceof MedicineError) return json({ error: error.code }, error.status)
  console.error('medicine_request_failure')
  return json({ error: 'unavailable' }, 503)
}

export async function GET() {
  try {
    return json({ medicines: await medicines.list() })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  // Cookie-authenticated mutations require an exact same-origin browser request.
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return json({ error: 'forbidden' }, 403)
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    return json({ error: 'validation' }, 415)
  try {
    const reader = request.body?.getReader()
    if (!reader) return json({ error: 'validation' }, 400)
    let body = ''
    let bytes = 0
    const decoder = new TextDecoder()
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 4096) {
        await reader.cancel()
        return json({ error: 'validation' }, 413)
      }
      body += decoder.decode(chunk.value, { stream: true })
    }
    body += decoder.decode()
    let input
    try {
      input = JSON.parse(body)
    } catch {
      return json({ error: 'validation' }, 400)
    }
    return json({ medicines: await medicines.save(input) })
  } catch (error) {
    return failure(error)
  }
}
