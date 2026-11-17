import { parseQuietHoursChange, type QuietHours, type QuietHoursCommand } from './contract'

// Shared application boundary for the account's Quiet hours. Every invocation authenticates
// first and scopes the Worker command to the signed-in account.
export function createQuietHoursOperations(dependencies: {
  requireUser: () => Promise<{ id: string }>
  send: (command: QuietHoursCommand) => Promise<QuietHours>
}) {
  return {
    async read(): Promise<QuietHours> {
      const user = await dependencies.requireUser()
      return dependencies.send({ operation: 'read', ownerId: user.id })
    },
    async set(input: unknown): Promise<QuietHours> {
      const user = await dependencies.requireUser()
      const change = parseQuietHoursChange(input)
      return dependencies.send({ operation: 'set', ownerId: user.id, change })
    },
  }
}
