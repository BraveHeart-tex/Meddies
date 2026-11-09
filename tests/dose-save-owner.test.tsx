import { expect, test } from 'vitest'
import { http, HttpResponse } from 'msw'
import { doseSaveKey, doseSaves } from '../src/features/schedules/dose-saves'
import type { DoseOccurrence, DoseOutcomeRecord } from '../src/features/schedules/contract'
import { scheduleKeys } from '../src/features/schedules/queries'
import { createQueryClient } from '../src/lib/session-query-client'
import { readSessionDraft, writeSessionDraft } from '../src/lib/session-drafts'
import { server } from './helpers/msw-server'

// The public save action must publish and clean drafts without any mounted screen.
test('an exact correction receipt finishes with both caches and drafts settled before refresh', async () => {
  const client = createQueryClient()
  const dose = {
    id: 'dose',
    scheduleId: '00000000-0000-4000-8000-000000000001',
    dueAt: '2026-11-14T06:00:00.000Z',
    medicineId: 'medicine',
    quantity: 1,
    status: 'Due now',
  } as DoseOccurrence
  const old = {
    scheduleId: dose.scheduleId,
    dueAt: dose.dueAt,
    outcome: 'Skipped',
    revision: 0,
  } as DoseOutcomeRecord
  client.setQueryData(scheduleKeys.snapshot(), {
    schedules: [],
    records: [old],
    date: '2026-11-14',
    now: dose.dueAt,
  })
  client.setQueryData(scheduleKeys.history('2026-11-14'), [
    { ...dose, status: 'Skipped', record: old },
  ])
  writeSessionDraft(client, 'dose-drawer:dose', { editor: 'Taken' })
  writeSessionDraft(client, 'dose-taken:dose', { quantity: '2' })
  let payload: Record<string, unknown> = {}
  server.use(
    http.patch('/api/schedules', async ({ request }) => {
      payload = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ record: { ...payload, revision: 1 } })
    }),
  )
  const saves = doseSaves(client)
  await saves.submit(doseSaveKey(dose), {
    dose,
    command: { outcome: 'Taken', takenAt: dose.dueAt, quantity: 2 },
    correction: { outcome: 'Skipped', revision: 0 },
    medicine: { label: 'Tablet', unit: 'tablet' },
    today: () => '2026-11-14',
  })
  expect(payload).toMatchObject({
    expectedRevision: 0,
    expectedOutcome: 'Skipped',
    actionId: expect.any(String),
  })
  expect(saves.get(doseSaveKey(dose))).toBeUndefined()
  expect(
    client.getQueryData<{ records: DoseOutcomeRecord[] }>(scheduleKeys.snapshot())?.records[0],
  ).toMatchObject({ outcome: 'Taken', revision: 1, actionId: payload.actionId })
  expect(
    client.getQueryData<DoseOccurrence[]>(scheduleKeys.history('2026-11-14'))?.[0],
  ).toMatchObject({ status: 'Taken', record: { revision: 1 } })
  expect(readSessionDraft(client, 'dose-drawer:dose')).toBeUndefined()
  expect(readSessionDraft(client, 'dose-taken:dose')).toBeUndefined()
  saves.end()
  client.clear()
})
