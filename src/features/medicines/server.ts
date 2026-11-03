import 'server-only'
import { requireUser } from '@/features/auth/server'
import { MedicineError, parseMedicine, type MedicineCommand } from './contract'
import { createMedicineOperations } from './operations'

async function send(command: MedicineCommand) {
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
    const response = await fetch(new URL('/medicines', url), {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    })
    if (response.status === 409) throw new MedicineError('conflict', 409)
    if (!response.ok) throw new Error('storage')
    const data = await response.json()
    if (!Array.isArray(data.medicines)) throw new Error('contract')
    return data.medicines.map(parseMedicine)
  } catch (error) {
    if (error instanceof MedicineError) throw error
    console.error('medicine_gateway_failure')
    throw new MedicineError('unavailable', 503)
  }
}

export const medicines = createMedicineOperations({
  async requireUser() {
    try {
      return await requireUser()
    } catch {
      throw new MedicineError('unauthorized', 401)
    }
  },
  send,
})
