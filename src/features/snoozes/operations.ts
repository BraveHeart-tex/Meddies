import { parseSnoozeRequest, type SnoozeCommand, type SnoozeResult } from './contract'

// Shared application boundary for Snoozes. Every invocation authenticates first and scopes the
// Worker command to the signed-in account.
export function createSnoozeOperations(dependencies: {
  requireUser: () => Promise<{ id: string }>
  send: (command: SnoozeCommand) => Promise<SnoozeResult>
}) {
  return {
    async snooze(input: unknown): Promise<SnoozeResult> {
      const user = await dependencies.requireUser()
      const request = parseSnoozeRequest(input)
      return dependencies.send({ operation: 'snooze', ownerId: user.id, request })
    },
  }
}
