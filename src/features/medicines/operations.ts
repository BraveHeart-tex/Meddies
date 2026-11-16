import { ApplicationError } from '../../lib/application-error'
import {
  parseMedicine,
  parseDetailCorrection,
  parseStrengthChange,
  parseMedicineArchive,
  parseMedicineRestore,
  parseMedicineRecord,
  parseMedicineDelete,
  parseMedicineDeleteReceipt,
  type MedicineDeleteReceipt,
  type Medicine,
  type MedicineCommand,
} from './contract'

// Shared application boundary. Authentication is performed for every invocation.
export function createMedicineOperations(dependencies: {
  requireUser: () => Promise<{ id: string }>
  send: (command: MedicineCommand) => Promise<Medicine[] | MedicineDeleteReceipt>
}) {
  const sendRows = async (command: Exclude<MedicineCommand, { operation: 'delete' }>) => {
    const rows = await dependencies.send(command)
    if (!Array.isArray(rows)) throw new ApplicationError('unavailable', 503)
    return rows
  }
  return {
    async delete(input: unknown) {
      const user = await dependencies.requireUser()
      const deletion = parseMedicineDelete(input)
      const result = await dependencies.send({ operation: 'delete', ownerId: user.id, deletion })
      try {
        const receipt = parseMedicineDeleteReceipt(result)
        if (
          receipt.actionId !== deletion.actionId ||
          receipt.medicineId !== deletion.medicineId ||
          receipt.expectedRevision !== deletion.expectedRevision
        )
          throw new Error('confirmation')
        return receipt
      } catch {
        throw new ApplicationError('unavailable', 503)
      }
    },
    async correctDetails(input: unknown) {
      const user = await dependencies.requireUser()
      const correction = parseDetailCorrection(input)
      const rows = await sendRows({
        operation: 'correctDetails',
        ownerId: user.id,
        correction,
      })
      return confirmedEdit(rows, correction)
    },
    async changeStrength(input: unknown) {
      const user = await dependencies.requireUser()
      const change = parseStrengthChange(input)
      const rows = await sendRows({
        operation: 'changeStrength',
        ownerId: user.id,
        change,
      })
      return confirmedEdit(rows, change)
    },
    async archive(input: unknown) {
      const user = await dependencies.requireUser()
      const archive = parseMedicineArchive(input)
      const rows = await sendRows({ operation: 'archive', ownerId: user.id, archive })
      const records = confirmedEdit(rows, archive)
      if (!records[0].archivedAt) throw new ApplicationError('unavailable', 503)
      return records
    },
    async restore(input: unknown) {
      const user = await dependencies.requireUser()
      const restore = parseMedicineRestore(input)
      const rows = await sendRows({ operation: 'restore', ownerId: user.id, restore })
      const records = confirmedEdit(rows, restore)
      if (rows[0].archivedAt !== null) throw new ApplicationError('unavailable', 503)
      return records
    },
    async list() {
      const user = await dependencies.requireUser()
      return sendRows({ operation: 'list', ownerId: user.id })
    },
    async save(input: unknown) {
      const user = await dependencies.requireUser()
      const medicine = parseMedicine(input)
      return sendRows({ operation: 'save', ownerId: user.id, medicine })
    },
  }
}

function confirmedEdit(
  rows: Medicine[],
  input: { medicineId: string; expectedRevision: number; actionId: string },
) {
  try {
    const records = rows.map(parseMedicineRecord)
    const saved = records[0]
    if (
      records.length !== 1 ||
      saved.id !== input.medicineId ||
      saved.revision !== input.expectedRevision + 1 ||
      saved.lastActionId !== input.actionId
    )
      throw new Error('confirmation')
    return records
  } catch {
    throw new ApplicationError('unavailable', 503)
  }
}
