import 'server-only'
import { MedicineError } from '@/features/medicines/contract'

export async function sendStorage(path: '/medicines' | '/schedules', command: unknown) {
  const secret = process.env.MEDICINES_WORKER_SECRET
  const configuredUrl = process.env.MEDICINES_WORKER_URL
  if (!secret || !configuredUrl) throw new MedicineError('unavailable', 503)
  try {
    const url = new URL(configuredUrl)
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    )
      throw new Error('configuration')
    const response = await fetch(new URL(path, url), {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    })
    if (response.status === 409) throw new MedicineError('conflict', 409)
    if (response.status === 400) throw new MedicineError('validation', 400)
    if (!response.ok) throw new Error('storage')
    return await response.json()
  } catch (error) {
    if (error instanceof MedicineError) throw error
    console.error('medicine_gateway_failure')
    throw new MedicineError('unavailable', 503)
  }
}
