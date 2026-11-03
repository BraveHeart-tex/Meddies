import { parseMedicine, type Medicine, type MedicineCommand } from './contract'

// Shared application boundary. Authentication is performed for every invocation.
export function createMedicineOperations(dependencies: {
  requireUser: () => Promise<{ id: string }>
  send: (command: MedicineCommand) => Promise<Medicine[]>
}) {
  return {
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
