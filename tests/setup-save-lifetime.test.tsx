import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
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
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Magnesium')
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name: 'Tablet' }))
  const form = screen.getByRole('button', { name: 'Save medication' }).closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  await waitFor(() => expect(posts).toHaveLength(1))
  first.unmount()
  const second = open()
  expect(screen.getByRole('button', { name: 'Saving medication...' })).toBeDisabled()
  await act(async () => held.release())
  await screen.findByText('That might not have saved.')
  second.unmount()
  open()
  await user.click(screen.getByRole('button', { name: 'Try saving medication again' }))
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
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Magnesium')
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name: 'Tablet' }))
  await user.click(screen.getByRole('button', { name: 'Save medication' }))
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
  let reads = 0
  server.use(
    http.get('/api/schedules', () => {
      reads++
      return HttpResponse.json({ schedules: [] })
    }),
    http.post('/api/schedules', async ({ request }) => {
      posts.push(await request.json())
      if (posts.length === 1) {
        await held.promise
        return HttpResponse.error()
      }
      return HttpResponse.json({
        schedules: [{ ...(posts[0] as object), confirmedAt: '2035-06-15T21:00:00.000Z' }],
      })
    }),
  )
  const user = userEvent.setup()
  const confirmed = vi.fn()
  const open = (today: string) =>
    render(
      <QueryClientProvider client={client}>
        <ScheduleForm
          medicine={{
            id: '00000000-0000-4000-8000-000000000001',
            label: 'Magnesium',
            strength: null,
            unit: 'tablet',
          }}
          today={today}
          serverNow={`${today}T07:00:00.000Z`}
          onSaved={confirmed}
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
  const second = open('2035-06-16')
  const retry = await screen.findByRole('button', { name: 'Try saving schedule again' })
  expect(reads).toBe(0)
  await user.click(retry)
  await waitFor(() => expect(posts).toHaveLength(2))
  expect(posts[1]).toEqual(posts[0])
  await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1))
  second.unmount()
  open('2035-06-16')
  expect(
    screen.queryByText('Pick up where you left off. Your details are still here.'),
  ).not.toBeInTheDocument()
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
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Magnesium')
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name: 'Tablet' }))
  await user.click(screen.getByRole('button', { name: 'Save medication' }))
  first.unmount()
  endSessionQueryClient()
  await act(async () => {
    held.release()
    await responded.promise
  })
  expect(client.getQueryData(medicineKeys.list())).toBeUndefined()
  expect(confirmations).toBe(0)
})
