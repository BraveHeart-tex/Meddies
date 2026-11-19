import 'server-only'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { parseMedicineResponse, parseMedicineDeleteReceipt, type MedicineCommand } from './contract'
import { ApplicationError } from '../../lib/application-error'
import { createMedicineOperations } from './operations'

export async function send(command: MedicineCommand) {
  try {
    const data = (await sendStorage('/medicines', command)) as {
      medicines?: unknown
      deletion?: unknown
    }
    if (command.operation === 'delete') return parseMedicineDeleteReceipt(data.deletion)
    if (!Array.isArray(data.medicines)) throw new Error('contract')
    try {
      if (
        (command.operation === 'stockOn' ||
          command.operation === 'stockOff' ||
          command.operation === 'stockCorrection' ||
          (command.operation === 'save' && command.medicine.startingCount !== undefined)) &&
        data.medicines.some((row) => !row || typeof row !== 'object' || !('stock' in row))
      )
        throw new Error('stock confirmation contract')
      // Legacy reads may omit archivedAt, but a restore must explicitly confirm it.
      if (
        command.operation === 'restore' &&
        data.medicines.some((row) => !row || row.archivedAt !== null)
      )
        throw new Error('restore confirmation contract')
      return data.medicines.map(parseMedicineResponse)
    } catch (error) {
      if (command.operation === 'save') throw new Error('save confirmation contract')
      throw error
    }
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
