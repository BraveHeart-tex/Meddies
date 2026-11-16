import { dehydrate, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import {
  confirmMedicine,
  confirmMedicineDeletion,
  medicineKeys,
  medicinesQuery,
} from '@/features/medicines/queries'
import { createQueryClient } from '@/lib/session-query-client'
import { PrivateQueryHandoff } from '@/lib/private-query-handoff'
import { server } from './helpers/msw-server'

const medicine = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Vitamin D',
  strength: null,
  unit: 'tablet' as const,
}

test('confirmed deletion survives late reads, hydration, query collection and replayed creation receipts within its session', async () => {
  const client = createQueryClient()
  const incoming = createQueryClient()
  server.use(http.get('/api/medicines', () => HttpResponse.json({ medicines: [medicine] })))
  client.setQueryData(medicineKeys.list(), [medicine])
  await confirmMedicineDeletion(client, medicine.id)
  expect(client.getQueryData(medicineKeys.list())).toEqual([])
  await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
  expect(client.getQueryData(medicineKeys.list())).toEqual([])
  incoming.setQueryData(medicineKeys.list(), [medicine], { updatedAt: Date.now() + 1000 })
  const view = render(
    <QueryClientProvider client={client}>
      <PrivateQueryHandoff state={dehydrate(incoming)}>
        <span />
      </PrivateQueryHandoff>
    </QueryClientProvider>,
  )
  expect(client.getQueryData(medicineKeys.list())).toEqual([])
  view.unmount()
  client.removeQueries({ queryKey: medicineKeys.all })
  await confirmMedicine(client, medicine)
  expect(client.getQueryData(medicineKeys.list())).toEqual([])
  await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
  expect(client.getQueryData(medicineKeys.list())).toEqual([])
  await confirmMedicine(incoming, medicine)
  expect(incoming.getQueryData(medicineKeys.list())).toEqual([medicine])
  client.clear()
  incoming.clear()
})
