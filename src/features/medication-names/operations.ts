import {
  parseMedicationNamesChange,
  type MedicationNames,
  type MedicationNamesCommand,
} from './contract'

// Shared application boundary for the account's Medication names. Every invocation authenticates
// first and scopes the Worker command to the signed-in account.
export function createMedicationNamesOperations(dependencies: {
  requireUser: () => Promise<{ id: string }>
  send: (command: MedicationNamesCommand) => Promise<MedicationNames>
}) {
  return {
    async read(): Promise<MedicationNames> {
      const user = await dependencies.requireUser()
      return dependencies.send({ operation: 'read', ownerId: user.id })
    },
    async set(input: unknown): Promise<MedicationNames> {
      const user = await dependencies.requireUser()
      const change = parseMedicationNamesChange(input)
      return dependencies.send({ operation: 'set', ownerId: user.id, change })
    },
  }
}
