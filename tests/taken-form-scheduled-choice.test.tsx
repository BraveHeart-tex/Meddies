import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import type { DoseOccurrence } from '../src/features/schedules/contract'
import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import { TakenForm } from '../src/features/schedules/taken-form'
import { createQueryClient } from '../src/lib/session-query-client'

const medicine: Medicine = { id: 'medicine', label: 'Iron', strength: null, unit: 'tablet' }
const dose: DoseOccurrence = {
  id: 'dose',
  scheduleId: 'schedule',
  medicineId: 'medicine',
  dueAt: '2026-11-05T06:00:00.000Z',
  quantity: 1,
  status: 'Due now',
}
const beforeTheMinute = '2026-11-05T05:59:00.000Z'
const duringTheMinute = '2026-11-05T06:00:30.000Z'
const afterTheMinute = '2026-11-05T06:01:00.000Z'
const earlyAlert = 'This dose is scheduled for 09:00. Saving now records it early.'

function renderForm(serverNow: string, restore?: Parameters<typeof TakenForm>[0]['restore']) {
  const client = createQueryClient()
  const ui = (at: string) => (
    <QueryClientProvider client={client}>
      <SchedulingClockProvider serverNow={at}>
        <TakenForm
          dose={dose}
          medicine={medicine}
          open
          saving={false}
          problem={null}
          onOpen={() => {}}
          onSubmit={async () => {}}
          mode="record"
          restore={restore}
        />
      </SchedulingClockProvider>
    </QueryClientProvider>
  )
  const view = render(ui(serverNow))
  return { moveClockTo: (at: string) => view.rerender(ui(at)) }
}

const scheduledChoice = () => screen.queryByRole('button', { name: 'At 09:00' })

test('before the scheduled minute the form warns and hides the scheduled choice', () => {
  renderForm(beforeTheMinute)
  expect(screen.getByText(earlyAlert)).toBeVisible()
  expect(scheduledChoice()).not.toBeInTheDocument()
})

test('during the scheduled minute the form offers Now and Other only, with no warning', () => {
  renderForm(duringTheMinute)
  expect(screen.getByRole('button', { name: /^Now · / })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Other' })).toBeVisible()
  expect(scheduledChoice()).not.toBeInTheDocument()
  expect(screen.queryByText(earlyAlert)).not.toBeInTheDocument()
})

test('the scheduled choice appears from the next minute without changing the selection', async () => {
  const { moveClockTo } = renderForm(duringTheMinute)
  expect(scheduledChoice()).not.toBeInTheDocument()
  moveClockTo(afterTheMinute)
  await waitFor(() => expect(scheduledChoice()).toBeVisible())
  expect(scheduledChoice()).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: /^Now · / })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByText(earlyAlert)).not.toBeInTheDocument()
})

test('a restored scheduled choice keeps rendering during the scheduled minute', () => {
  renderForm(duringTheMinute, {
    values: { when: 'scheduled', date: '', time: '', quantity: '1' },
    now: '2026-11-05T09:00',
  })
  expect(scheduledChoice()).toHaveAttribute('aria-pressed', 'true')
})
