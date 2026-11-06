import 'server-only'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { parseMedicine, type MedicineCommand, type MedicineResponse } from './contract'
import { ApplicationError } from '../../lib/application-error'
import { createMedicineOperations } from './operations'

export async function send<C extends MedicineCommand>(
  command: C,
): Promise<MedicineResponse<C>['medicines']> {
  try {
    const data = (await sendStorage('/medicines', command)) as { medicines?: unknown }
    if (!Array.isArray(data.medicines)) throw new Error('contract')
    return data.medicines.map(parseMedicine)
  } catch (error) {
    if (error instanceof ApplicationError) throw error
    console.error('medicine_gateway_failure')
    throw new ApplicationError('unavailable', 503)
  }
}

export const medicines = createMedicineOperations({
  async requireUser() {
    try {
      return await requireUser()
    } catch {
      throw new ApplicationError('unauthorized', 401)
    }
  },
  send,
})
