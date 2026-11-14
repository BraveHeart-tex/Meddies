import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
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
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Draft medicine')
  await user.type(screen.getByLabelText(/^Strength/), ' 5 mg ')
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name: 'Capsule' }))
  first.unmount()
  const second = open()
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Draft medicine')
  expect(screen.getByLabelText(/^Strength/)).toHaveValue(' 5 mg ')
  expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Capsule')
  expect(screen.getByText('Pick up where you left off. Your details are still here.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Clear form' }))
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('')
  expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Choose')
  second.unmount()
  open()
  expect(
    screen.queryByText('Pick up where you left off. Your details are still here.'),
  ).not.toBeInTheDocument()
  client.clear()
})

test('schedule drafts keep partial rows per medicine across refresh and day rollover', async () => {
  const client = createQueryClient()
  const user = userEvent.setup()
  const medicine = {
    id: '00000000-0000-4000-8000-000000000001',
    label: 'First',
    strength: null,
    unit: 'tablet' as const,
  }
  const view = (id: string, today: string) => (
    <QueryClientProvider client={client}>
      <SchedulingClockProvider serverNow={`${today}T07:00:00.000Z`}>
        <ScheduleForm
          key={id}
          medicine={{ ...medicine, id }}
          today={today}
          serverNow={`${today}T07:00:00.000Z`}
          onSaved={() => {}}
          onConflict={() => {}}
        />
      </SchedulingClockProvider>
    </QueryClientProvider>
  )
  const first = render(view('first', '2035-06-15'))
  await user.click(screen.getByRole('combobox', { name: 'Time 1 hour' }))
  await user.click(await screen.findByRole('option', { name: '08' }))
  await user.click(screen.getByRole('button', { name: 'Add another time' }))
  await user.clear(screen.getByLabelText('Quantity for time 2'))
  first.rerender(view('first', '2035-06-16'))
  expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toHaveTextContent('08')
  first.rerender(view('second', '2035-06-16'))
  expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toHaveTextContent('HH')
  expect(
    screen.queryByText('Pick up where you left off. Your details are still here.'),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('combobox', { name: 'Time 1 hour' }))
  await user.click(await screen.findByRole('option', { name: '10' }))
  first.rerender(view('first', '2035-06-16'))
  expect(screen.getByText('Pick up where you left off. Your details are still here.')).toBeVisible()
  expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toHaveTextContent('08')
  expect(screen.getByRole('combobox', { name: 'Time 1 minute' })).toHaveTextContent('MM')
  expect(screen.getByLabelText('Quantity for time 2')).toHaveValue('')
  expect(screen.getByRole('button', { name: /^Start date,/ })).toHaveAccessibleName(/15 Jun/)
  await user.click(screen.getByRole('button', { name: 'Clear form' }))
  expect(screen.queryByLabelText('Quantity for time 2')).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toHaveTextContent('HH')
  expect(screen.getByRole('button', { name: /^Start date,/ })).toHaveAccessibleName(/Today/)
  // Clearing one medicine's draft leaves another's.
  first.rerender(view('second', '2035-06-16'))
  expect(screen.getByText('Pick up where you left off. Your details are still here.')).toBeVisible()
  expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toHaveTextContent('10')
  first.unmount()
  client.clear()
})

test('a confirmed schedule save removes the draft before the form is opened again', async () => {
  const client = createQueryClient()
  const user = userEvent.setup()
  const medicine = {
    id: '00000000-0000-4000-8000-000000000001',
    label: 'First',
    strength: null,
    unit: 'tablet' as const,
  }
  let saved = false
  server.use(
    http.post('/api/schedules', async ({ request }) => {
      const values = await request.json()
      return HttpResponse.json({
        schedules: [{ ...(values as object), confirmedAt: '2035-06-15T06:00:00.000Z' }],
      })
    }),
  )
  const open = () =>
    render(
      <QueryClientProvider client={client}>
        <SchedulingClockProvider serverNow="2035-06-15T07:00:00.000Z">
          <ScheduleForm
            medicine={medicine}
            today="2035-06-15"
            serverNow="2035-06-15T07:00:00.000Z"
            onSaved={() => {
              saved = true
            }}
            onConflict={() => {}}
          />
        </SchedulingClockProvider>
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
  expect(screen.getByText('Pick up where you left off. Your details are still here.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Save schedule' }))
  await waitFor(() => expect(saved).toBe(true))
  second.unmount()
  open()
  expect(screen.getByRole('combobox', { name: 'Time 1 hour' })).toHaveTextContent('HH')
  expect(
    screen.queryByText('Pick up where you left off. Your details are still here.'),
  ).not.toBeInTheDocument()
  client.clear()
})

test('the add form keeps a save 401 retryable until the session check confirms an end', async () => {
  server.use(
    http.get('/api/session', () =>
      HttpResponse.json({ id: 'owner', expires: '2099-01-01T00:00:00Z' }),
    ),
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [] })),
    http.post('/api/medicines', () =>
      HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
    ),
  )
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MedicineForm onSaved={() => {}} />
    </QueryClientProvider>,
  )
  expect(screen.getByRole('group', { name: 'Medication details' })).toBeVisible()
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Magnesium')
  await user.type(screen.getByLabelText(/^Strength/), '5 mg')
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name: 'Tablet' }))
  await user.click(screen.getByRole('button', { name: 'Save medication' }))
  expect(
    await screen.findByText("Your details are still here - trying again won't add it twice."),
  ).toBeVisible()
  expect(screen.queryByText('Your session ended.')).not.toBeInTheDocument()
})
