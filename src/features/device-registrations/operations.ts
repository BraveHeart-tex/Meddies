import {
  parseDeviceInstallation,
  parseDeviceRegistration,
  type DeviceRegistrationCommand,
  type DeviceRegistrationStatus,
} from './contract'

// Shared application boundary for this device's Device registration. Every invocation
// authenticates first and scopes the Worker command to the signed-in account.
export function createDeviceRegistrationOperations(dependencies: {
  requireUser: () => Promise<{ id: string }>
  send: (command: DeviceRegistrationCommand) => Promise<DeviceRegistrationStatus>
}) {
  const withRegistration =
    (operation: 'save' | 'renew') =>
    async (input: unknown): Promise<DeviceRegistrationStatus> => {
      const user = await dependencies.requireUser()
      const registration = parseDeviceRegistration(input)
      return dependencies.send({ operation, ownerId: user.id, registration })
    }
  const withInstallation =
    (operation: 'remove' | 'read') =>
    async (input: unknown): Promise<DeviceRegistrationStatus> => {
      const user = await dependencies.requireUser()
      const installation = parseDeviceInstallation(input)
      return dependencies.send({ operation, ownerId: user.id, installation })
    }
  return {
    save: withRegistration('save'),
    renew: withRegistration('renew'),
    remove: withInstallation('remove'),
    read: withInstallation('read'),
  }
}
