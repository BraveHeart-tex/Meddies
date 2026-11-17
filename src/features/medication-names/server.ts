import 'server-only'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { ApplicationError } from '../../lib/application-error'
import { parseMedicationNames, type MedicationNamesCommand } from './contract'
import { createMedicationNamesOperations } from './operations'

export async function send(command: MedicationNamesCommand) {
  try {
    return parseMedicationNames(await sendStorage('/medication-names', command))
  } catch (error) {
    if (error instanceof ApplicationError) throw error
    console.error('medication_names_gateway_failure')
    throw new ApplicationError('unavailable', 503)
  }
}

export const medicationNames = createMedicationNamesOperations({
  async requireUser() {
    try {
      return await requireUser()
    } catch {
      throw new ApplicationError('unauthorized', 401)
    }
  },
  send,
})
