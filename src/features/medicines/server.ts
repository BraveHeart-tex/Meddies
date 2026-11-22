import 'server-only'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import {
  parseMedicineResponse,
  parseMedicineDeleteReceipt,
  parseMedicineRecord,
  type MedicineCommand,
} from './contract'
import { ApplicationError } from '../../lib/application-error'
import { createMedicineOperations, createTypeCorrectionOperations } from './operations'
import { parseTypeCorrectionReview, type TypeCorrectionCommand } from './type-correction-contract'

export { typeCorrectionBodyLimit } from './type-correction-contract'

export async function send(command: MedicineCommand) {
  const data = (await sendStorage('/medicines', command)) as {
    medicines?: unknown
    deletion?: unknown
  }
  try {
    if (command.operation === 'delete') return parseMedicineDeleteReceipt(data.deletion)
    if (!Array.isArray(data.medicines)) throw new Error('contract')
    if (
      (command.operation === 'stockOn' ||
        command.operation === 'stockOff' ||
        command.operation === 'stockCorrection' ||
        command.operation === 'stockRefill' ||
        command.operation === 'stockThreshold' ||
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
  } catch {
    console.error('medicine_gateway_failure')
    throw new ApplicationError('unavailable', 503)
  }
}

async function requireMedicineUser() {
  try {
    return await requireUser()
  } catch {
    throw new ApplicationError('unauthorized', 401)
  }
}

async function sendTypeCorrection(command: TypeCorrectionCommand) {
  const data = (await sendStorage('/medicine-type-correction', command)) as {
    review?: unknown
    medicines?: unknown
  }
  try {
    if (command.operation === 'reviewTypeCorrection') return parseTypeCorrectionReview(data.review)
    if (!Array.isArray(data.medicines) || data.medicines.some((row) => !row?.stock))
      throw new Error('stock confirmation contract')
    return data.medicines.map(parseMedicineRecord)
  } catch {
    console.error('medicine_gateway_failure')
    throw new ApplicationError('unavailable', 503)
  }
}

export const medicines = createMedicineOperations({ requireUser: requireMedicineUser, send })
export const medicineTypeCorrection = createTypeCorrectionOperations({
  requireUser: requireMedicineUser,
  send: sendTypeCorrection,
})
