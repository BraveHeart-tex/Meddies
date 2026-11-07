import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from './helpers/msw-server'
import { MedicineForm } from '../src/features/medicines/medicine-form'
import { ScheduleForm } from '../src/features/schedules/schedule-form'
import { medicineKeys, medicinesQuery } from '../src/features/medicines/queries'
import { endSessionQueryClient, sessionQueryClient } from '../src/lib/session-query-client'
import { createQueryClient } from '../src/lib/session-query-client'

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => (release = resolve))
  return { promise, release }
}

test('a pending medicine save survives remount, locks duplicate submit and retries the same attempt', async () => {
  const client = createQueryClient()
  const held = deferred()
  const posts: unknown[] = []
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [] })),
    http.post('/api/medicines', async ({ request }) => {
      posts.push(await request.json())
      if (posts.length === 1) {
        await held.promise
        return HttpResponse.error()
      }
      return HttpResponse.json({ medicines: [posts[0]] })
    }),
  )
  const open = () =>
    render(
      <QueryClientProvider client={client}>
        <MedicineForm onSaved={() => {}} />
      </QueryClientProvider>,
    )
  const user = userEvent.setup()
  const first = open()
  await user.type(screen.getByLabelText('Medicine name'), 'Magnesium')
  await user.click(screen.getByRole('button', { name: 'Tablet' }))
  const form = screen.getByRole('button', { name: 'Save medicine' }).closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  await waitFor(() => expect(posts).toHaveLength(1))
  first.unmount()
  const second = open()
  expect(screen.getByRole('button', { name: 'Saving medicine...' })).toBeDisabled()
  await act(async () => held.release())
  await screen.findByText('Save could not be confirmed.')
  second.unmount()
  open()
  await user.click(screen.getByRole('button', { name: 'Retry saving medicine' }))
  await waitFor(() => expect(posts).toHaveLength(2))
  expect(posts[1]).toEqual(posts[0])
  client.clear()
})

test('a confirmed medicine remains cached when a later stale list omits it', async () => {
  const client = createQueryClient()
  const held = deferred()
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [] })),
    http.post('/api/medicines', async ({ request }) => {
      const medicine = await request.json()
      await held.promise
      return HttpResponse.json({ medicines: [medicine] })
    }),
  )
  const user = userEvent.setup()
  const first = render(
    <QueryClientProvider client={client}>
      <MedicineForm onSaved={() => {}} />
    </QueryClientProvider>,
  )
  await user.type(screen.getByLabelText('Medicine name'), 'Magnesium')
  await user.click(screen.getByRole('button', { name: 'Tablet' }))
  await user.click(screen.getByRole('button', { name: 'Save medicine' }))
  first.unmount()
  await act(async () => held.release())
  await waitFor(() =>
    expect(client.getQueryData(medicineKeys.list())).toEqual([
      expect.objectContaining({ label: 'Magnesium' }),
    ]),
  )
  await client.fetchQuery({ ...medicinesQuery(), staleTime: 0 })
  expect(client.getQueryData(medicineKeys.list())).toEqual([
    expect.objectContaining({ label: 'Magnesium' }),
  ])
  client.clear()
})

test('a schedule retry after remount and midnight keeps the submitted request', async () => {
  const client = createQueryClient()
  const held = deferred()
  const posts: unknown[] = []
  server.use(
    http.post('/api/schedules', async ({ request }) => {
      posts.push(await request.json())
      if (posts.length === 1) {
        await held.promise
        return HttpResponse.error()
      }
      return HttpResponse.json({ schedules: [posts[0]] })
    }),
  )
  const user = userEvent.setup()
  const open = (today: string) =>
    render(
      <QueryClientProvider client={client}>
        <ScheduleForm
          medicine={{ id: 'first', label: 'Magnesium', strength: null, unit: 'tablet' }}
          today={today}
          onSaved={() => {}}
          onConflict={() => {}}
        />
      </QueryClientProvider>,
    )
  const first = open('2035-06-15')
  for (const [part, value] of [
    ['hour', '12'],
    ['minute', '00'],
  ]) {
    await user.click(screen.getByRole('combobox', { name: `Time 1 ${part}` }))
    await user.click(await screen.findByRole('option', { name: value }))
  }
  fireEvent.submit(screen.getByRole('button', { name: 'Save schedule' }).closest('form')!)
  fireEvent.submit(screen.getByRole('button', { name: 'Save schedule' }).closest('form')!)
  await waitFor(() => expect(posts).toHaveLength(1))
  first.unmount()
  await act(async () => held.release())
  open('2035-06-16')
  await user.click(await screen.findByRole('button', { name: 'Retry saving schedule' }))
  await waitFor(() => expect(posts).toHaveLength(2))
  expect(posts[1]).toEqual(posts[0])
  client.clear()
})

test('session end prevents a late save response from restoring private cache or callbacks', async () => {
  const client = sessionQueryClient('save-lifetime')
  const held = deferred()
  const responded = deferred()
  server.use(
    http.post('/api/medicines', async ({ request }) => {
      const medicine = await request.json()
      await held.promise
      responded.release()
      return HttpResponse.json({ medicines: [medicine] })
    }),
  )
  let confirmations = 0
  const user = userEvent.setup()
  const first = render(
    <QueryClientProvider client={client}>
      <MedicineForm
        onSaved={() => {
          confirmations++
        }}
      />
    </QueryClientProvider>,
  )
  await user.type(screen.getByLabelText('Medicine name'), 'Magnesium')
  await user.click(screen.getByRole('button', { name: 'Tablet' }))
  await user.click(screen.getByRole('button', { name: 'Save medicine' }))
  first.unmount()
  endSessionQueryClient()
  await act(async () => {
    held.release()
    await responded.promise
  })
  expect(client.getQueryData(medicineKeys.list())).toBeUndefined()
  expect(confirmations).toBe(0)
})
