import { MedicineError } from '@/features/medicines/contract'

export async function readJsonRequest(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new MedicineError('validation', 400)
  let body = ''
  let bytes = 0
  const decoder = new TextDecoder()
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytes += chunk.value.byteLength
    if (bytes > 4096) {
      await reader.cancel()
      throw new MedicineError('validation', 413)
    }
    body += decoder.decode(chunk.value, { stream: true })
  }
  body += decoder.decode()
  try {
    return JSON.parse(body)
  } catch {
    throw new MedicineError('validation', 400)
  }
}
