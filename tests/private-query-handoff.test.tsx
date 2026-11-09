import { useLayoutEffect } from 'react'
import { dehydrate, QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PrivateQueryHandoff } from '@/lib/private-query-handoff'
import { createQueryClient } from '@/lib/session-query-client'
import { medicineKeys } from '@/features/medicines/queries'
import { scheduleKeys, type ScheduleSnapshot } from '@/features/schedules/queries'
import type { DoseOccurrence, DoseOutcomeRecord } from '@/features/schedules/contract'

const base: ScheduleSnapshot = {
  schedules: [],
  records: [],
  date: '2026-11-14',
  now: '2026-11-14T06:00:00.000Z',
}
const record: DoseOutcomeRecord = {
  scheduleId: '00000000-0000-4000-8000-000000000001',
  dueAt: base.now,
  outcome: 'Skipped',
  recordedAt: base.now,
  revision: 2,
}
const dose: DoseOccurrence = {
  id: 'dose',
  scheduleId: record.scheduleId,
  medicineId: 'medicine',
  dueAt: base.now,
  quantity: 1,
  status: 'Not logged',
}
const saved = { id: 'saved', label: 'Saved medication', unit: 'tablet', strength: null }

function Confirm({ client }: { client: QueryClient }) {
  useLayoutEffect(() => {
    // Commit after the handoff renders, before its deferred hydration effect applies.
    client.setQueryData(medicineKeys.list(), [saved], { updatedAt: 2 })
    client.setQueryData(scheduleKeys.snapshot(), { ...base, records: [record] }, { updatedAt: 2 })
    client.setQueryData(scheduleKeys.history(base.date), [{ ...dose, status: 'Skipped', record }], {
      updatedAt: 2,
    })
  }, [client])
  return null
}

test('hydration reads confirmations made between render and application from the live cache', () => {
  const client = createQueryClient()
  const incoming = createQueryClient()
  for (const target of [client, incoming]) {
    const updatedAt = target === client ? 1 : 3
    target.setQueryData(medicineKeys.list(), [], { updatedAt })
    target.setQueryData(scheduleKeys.snapshot(), base, { updatedAt })
    target.setQueryData(scheduleKeys.history(base.date), [dose], { updatedAt })
  }
  render(
    <QueryClientProvider client={client}>
      <PrivateQueryHandoff state={dehydrate(incoming)}>
        <Confirm client={client} />
      </PrivateQueryHandoff>
    </QueryClientProvider>,
  )
  expect(client.getQueryData(medicineKeys.list())).toEqual([saved])
  expect(client.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())?.records).toEqual([record])
  expect(client.getQueryData(scheduleKeys.history(base.date))).toEqual([
    { ...dose, status: 'Skipped', record },
  ])
  client.clear()
  incoming.clear()
})

test('empty incoming History stays empty and snapshot date rollover keeps its coverage semantics', () => {
  const client = createQueryClient()
  const incoming = createQueryClient()
  client.setQueryData(scheduleKeys.history(base.date), [{ ...dose, status: 'Skipped', record }], {
    updatedAt: 1,
  })
  client.setQueryData(scheduleKeys.snapshot(), { ...base, records: [record] }, { updatedAt: 1 })
  incoming.setQueryData(scheduleKeys.history(base.date), [], { updatedAt: 3 })
  const nextDay = { ...base, date: '2026-11-15', now: '2026-11-15T06:00:00.000Z' }
  incoming.setQueryData(scheduleKeys.snapshot(), nextDay, { updatedAt: 3 })
  const view = render(
    <QueryClientProvider client={client}>
      <PrivateQueryHandoff state={dehydrate(incoming)}>
        <span />
      </PrivateQueryHandoff>
    </QueryClientProvider>,
  )
  expect(client.getQueryData(scheduleKeys.history(base.date))).toEqual([])
  expect(client.getQueryData(scheduleKeys.snapshot())).toEqual(nextDay)
  incoming.setQueryData(scheduleKeys.snapshot(), base, { updatedAt: 4 })
  view.rerender(
    <QueryClientProvider client={client}>
      <PrivateQueryHandoff state={dehydrate(incoming)}>
        <span />
      </PrivateQueryHandoff>
    </QueryClientProvider>,
  )
  expect(client.getQueryData(scheduleKeys.snapshot())).toEqual(nextDay)
  client.clear()
  incoming.clear()
})

test('an unregistered private family cannot silently replace cached data', () => {
  const client = createQueryClient()
  const incoming = createQueryClient()
  incoming.setQueryData(['new-private-family'], [])
  expect(() =>
    render(
      <QueryClientProvider client={client}>
        <PrivateQueryHandoff state={dehydrate(incoming)}>
          <span />
        </PrivateQueryHandoff>
      </QueryClientProvider>,
    ),
  ).toThrow('explicit handoff policy')
  client.clear()
  incoming.clear()
})
