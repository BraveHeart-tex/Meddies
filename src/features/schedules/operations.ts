import { scheduleToday } from './occurrences'
import { parseSchedule, type DailySchedule, type ScheduleCommand } from './contract'

export function createScheduleOperations(dependencies: {
  requireUser: () => Promise<{ id: string }>
  send: (command: ScheduleCommand) => Promise<DailySchedule[]>
  now?: () => Date
}) {
  return {
    async save(input: unknown) {
      const user = await dependencies.requireUser()
      const schedule = parseSchedule(input)
      return dependencies.send({ operation: 'save', ownerId: user.id, schedule })
    },
    async snapshot() {
      const user = await dependencies.requireUser()
      const schedules = await dependencies.send({ operation: 'list', ownerId: user.id })
      return { schedules, today: scheduleToday(schedules, dependencies.now?.() ?? new Date()) }
    },
  }
}
