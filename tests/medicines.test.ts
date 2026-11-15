import type { MedicineCommand } from '../src/features/medicines/contract'
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createMedicineOperations } from '../src/features/medicines/operations'

test('medicine operations reject invalid labels and units before persistence', async () => {
  const operations = createMedicineOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: async () => assert.fail('invalid input must not reach storage'),
  })
  for (const patch of [{ label: ' ' }, { unit: 'liquid' }, { strength: 'x'.repeat(121) }]) {
    await assert.rejects(
      () =>
        operations.save({
          id: '6e0b55ee-2e10-4e00-80f2-a736c2f50f95',
          label: 'Vitamin D3',
          strength: '1000 IU',
          unit: 'tablet',
          ...patch,
        }),
      /validation/,
    )
  }
})

test('operations derive ownership from the session and never accept a supplied owner', async () => {
  const commands: MedicineCommand[] = []
  const operations = createMedicineOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: async (command) => {
      commands.push(command)
      return []
    },
  })
  await operations.save({
    id: '6e0b55ee-2e10-4e00-80f2-a736c2f50f95',
    label: ' Vitamin D3 ',
    strength: ' ',
    unit: 'tablet',
    ownerId: 'google:bob',
  })
  await operations.list()
  assert.deepEqual(commands, [
    {
      operation: 'save',
      ownerId: 'google:alice',
      medicine: {
        id: '6e0b55ee-2e10-4e00-80f2-a736c2f50f95',
        label: 'Vitamin D3',
        strength: null,
        unit: 'tablet',
      },
    },
    { operation: 'list', ownerId: 'google:alice' },
  ])
})

test('edit operations derive ownership and reject unsupported units, instants and stale confirmation contracts', async () => {
  const commands: MedicineCommand[] = []
  const operations = createMedicineOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: async (command) => {
      commands.push(command)
      return []
    },
  })
  const key = {
    actionId: '00000000-0000-4000-8000-000000000001',
    medicineId: '00000000-0000-4000-8000-000000000002',
    expectedRevision: 0,
  }
  const correction = {
    ...key,
    strengthRevisionId: key.medicineId,
    label: 'Example',
    strength: '200 mg',
    unit: 'tablet',
    ownerId: 'google:bob',
  }
  await assert.rejects(() => operations.correctDetails({ ...correction, unit: 'ml' }), /validation/)
  const change = {
    ...key,
    strength: '400 mg',
    effectiveAt: '2026-11-05T06:00:00.000Z',
    timeZone: 'Europe/Istanbul',
  }
  await assert.rejects(
    () => operations.changeStrength({ ...change, timeZone: 'UTC' }),
    /validation/,
  )
  await assert.rejects(
    () => operations.changeStrength({ ...change, effectiveAt: '2026-11-05T09:00:00+03:00' }),
    /validation/,
  )
  await assert.rejects(() => operations.changeStrength(change), /unavailable/)
  await assert.rejects(() => operations.correctDetails(correction), /unavailable/)
  assert.equal(commands.length, 2)
  assert.ok(commands.every((command) => command.ownerId === 'google:alice'))
})
