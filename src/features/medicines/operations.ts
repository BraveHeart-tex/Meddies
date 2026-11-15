import { ApplicationError } from '../../lib/application-error'
import {
  parseMedicine,
  parseDetailCorrection,
  parseStrengthChange,
  parseMedicineRecord,
  type Medicine,
  type MedicineCommand,
} from './contract'

// Shared application boundary. Authentication is performed for every invocation.
export function createMedicineOperations(dependencies: {
  requireUser: () => Promise<{ id: string }>
  send: (command: MedicineCommand) => Promise<Medicine[]>
}) {
  return {
    async correctDetails(input: unknown) {
      const user = await dependencies.requireUser()
      const correction = parseDetailCorrection(input)
      const rows = await dependencies.send({
        operation: 'correctDetails',
        ownerId: user.id,
        correction,
      })
      return confirmedEdit(rows, correction)
    },
    async changeStrength(input: unknown) {
      const user = await dependencies.requireUser()
      const change = parseStrengthChange(input)
      const rows = await dependencies.send({
        operation: 'changeStrength',
        ownerId: user.id,
        change,
      })
      return confirmedEdit(rows, change)
    },
    async list() {
      const user = await dependencies.requireUser()
      return dependencies.send({ operation: 'list', ownerId: user.id })
    },
    async save(input: unknown) {
      const user = await dependencies.requireUser()
      const medicine = parseMedicine(input)
      return dependencies.send({ operation: 'save', ownerId: user.id, medicine })
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
