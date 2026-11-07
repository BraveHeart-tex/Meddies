import { http, HttpResponse } from 'msw'
import { server } from './helpers/msw-server'
import { waitFor } from '@testing-library/react'
import { ScheduleForm } from '../src/features/schedules/schedule-form'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { MedicineForm } from '../src/features/medicines/medicine-form'
import { createQueryClient } from '../src/lib/session-query-client'

test('Add restores editing values across remounts and Clear form discards them', async () => {
  const client = createQueryClient()
  const user = userEvent.setup()
  const open = () =>
    render(
      <QueryClientProvider client={client}>
        <MedicineForm onSaved={() => {}} />
      </QueryClientProvider>,
    )
  const first = open()
  await user.type(screen.getByLabelText('Medicine name'), 'Draft medicine')
  await user.type(screen.getByLabelText(/^Product strength/), ' 5 mg ')
  await user.click(screen.getByRole('button', { name: 'Capsule' }))
  first.unmount()
  const second = open()
  expect(screen.getByLabelText('Medicine name')).toHaveValue('Draft medicine')
  expect(screen.getByLabelText(/^Product strength/)).toHaveValue(' 5 mg ')
  expect(screen.getByRole('button', { name: 'Capsule' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('Unsaved details from earlier.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Clear form' }))
  expect(screen.getByLabelText('Medicine name')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Capsule' })).toHaveAttribute('aria-pressed', 'false')
  second.unmount()
  open()
  expect(screen.queryByText('Unsaved details from earlier.')).not.toBeInTheDocument()
  client.clear()
})

test('schedule drafts keep partial rows per medicine across refresh and day rollover', async () => {
  const client = createQueryClient()
  const user = userEvent.setup()
  const medicine = { id: 'first', label: 'First', strength: null, unit: 'tablet' as const }
  const view = (id: string, today: string) => (
    <QueryClientProvider client={client}>
      <ScheduleForm
        key={id}
        medicine={{ ...medicine, id }}
        today={today}
        onSaved={() => {}}
        onConflict={() => {}}
      />
    </QueryClientProvider>
  )
  const first = render(view('first', '2035-06-15'))
  await user.click(screen.getByRole('combobox', { name: 'Time 1 hour' }))
  await user.click(screen.getByRole('option', { name: '08' }))
  await user.click(screen.getByRole('button', { name: 'Add another time' }))
  await user.clear(screen.getByLabelText('Quantity for time 2'))
  first.rerender(view('first', '2035-06-16'))
  expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toHaveTextContent('08')
  first.rerender(view('second', '2035-06-16'))
  expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toHaveTextContent('HH')
  expect(screen.queryByText('Unsaved details from earlier.')).not.toBeInTheDocument()
  first.rerender(view('first', '2035-06-16'))
  expect(screen.getByText('Unsaved details from earlier.')).toBeVisible()
  expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toHaveTextContent('08')
  expect(screen.getByRole('combobox', { name: 'Time 1 minute' })).toHaveTextContent('MM')
  expect(screen.getByLabelText('Quantity for time 2')).toHaveValue('')
  expect(screen.getByRole('button', { name: /^Start date,/ })).toHaveAccessibleName(/15 Jun/)
  await user.click(screen.getByRole('button', { name: 'Clear form' }))
  expect(screen.queryByLabelText('Quantity for time 2')).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toHaveTextContent('HH')
  expect(screen.getByRole('button', { name: /^Start date,/ })).toHaveAccessibleName(/Today/)
  first.unmount()
  client.clear()
})

test('a confirmed schedule save removes the draft before the form is opened again', async () => {
  const client = createQueryClient()
  const user = userEvent.setup()
  const medicine = { id: 'first', label: 'First', strength: null, unit: 'tablet' as const }
  let saved = false
  server.use(
    http.post('/api/schedules', async ({ request }) => {
      const values = await request.json()
      return HttpResponse.json({
        schedules: [{ ...(values as object), confirmedAt: '2035-06-15T06:00:00Z' }],
      })
    }),
  )
  const open = () =>
    render(
      <QueryClientProvider client={client}>
        <ScheduleForm
          medicine={medicine}
          today="2035-06-15"
          onSaved={() => {
            saved = true
          }}
          onConflict={() => {}}
        />
      </QueryClientProvider>,
    )
  const first = open()
  for (const [part, value] of [
    ['hour', '08'],
    ['minute', '15'],
  ]) {
    await user.click(screen.getByRole('combobox', { name: `Time 1 ${part}` }))
    await user.click(await screen.findByRole('option', { name: value }))
  }
  first.unmount()
  const second = open()
  expect(screen.getByText('Unsaved details from earlier.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Save schedule' }))
  await waitFor(() => expect(saved).toBe(true))
  second.unmount()
  open()
  expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toHaveTextContent('HH')
  expect(screen.queryByText('Unsaved details from earlier.')).not.toBeInTheDocument()
  client.clear()
})
