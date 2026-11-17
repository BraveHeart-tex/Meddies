import { parseDoseHistoryRequest, type DoseHistory, type DoseHistoryCommand } from './contract'

// Shared application boundary for Dose history. Every read authenticates first and scopes the
// Worker command to the signed-in account; the Worker reads another owner's medication as not found.
export function createDoseHistoryOperations(dependencies: {
  requireUser: () => Promise<{ id: string }>
  send: (command: DoseHistoryCommand) => Promise<DoseHistory>
}) {
  return {
    async read(input: unknown): Promise<DoseHistory> {
      const user = await dependencies.requireUser()
      const request = parseDoseHistoryRequest(input)
      return dependencies.send({ operation: 'read', ownerId: user.id, ...request })
    },
  }
}
