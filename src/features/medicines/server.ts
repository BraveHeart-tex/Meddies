import 'server-only'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { MedicineError, parseMedicine, type MedicineCommand } from './contract'
import { createMedicineOperations } from './operations'

async function send(command: MedicineCommand) {
  try {
    const data = await sendStorage('/medicines', command)
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
