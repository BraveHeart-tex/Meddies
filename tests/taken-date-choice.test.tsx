import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import type { DoseOccurrence } from '../src/features/schedules/contract'
import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import { TakenForm } from '../src/features/schedules/taken-form'
import { createQueryClient } from '../src/lib/session-query-client'

// 14:00 on Saturday 14 November in Istanbul (UTC+3).
const serverNow = '2026-11-14T11:00:00.000Z'
const medicine: Medicine = { id: 'medicine', label: 'Iron', strength: null, unit: 'tablet' }
const notLogged = (dueAt: string): DoseOccurrence => ({
  id: 'dose',
  scheduleId: 'schedule',
  medicineId: 'medicine',
  dueAt,
  quantity: 1,
  status: 'Not logged',
})
const dueToday = notLogged('2026-11-14T06:00:00.000Z')
const dueThreeDaysAgo = notLogged('2026-11-11T06:00:00.000Z')

function renderForm(dose: DoseOccurrence, mode: 'record' | 'edit' = 'record') {
  const onSubmit = vi.fn(async () => {})
  render(
    <QueryClientProvider client={createQueryClient()}>
      <SchedulingClockProvider serverNow={serverNow}>
        <TakenForm
          dose={dose}
          medicine={medicine}
          open
          saving={false}
          problem={null}
          onOpen={() => {}}
          onSubmit={onSubmit}
          mode={mode}
        />
      </SchedulingClockProvider>
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), onSubmit }
}

/** The Taken date choices as [visible text, accessible name, pressed]. */
const dayChoices = () =>
  within(screen.getByRole('group', { name: 'Taken date' }))
    .getAllByRole('button')
    .map((day) => [day.textContent, day.getAttribute('aria-label'), day.ariaPressed])

// Regression: Other's date offered a whole calendar, or days outside the dose's window.
test('a dose due today offers yesterday and today, named as long days', async () => {
  const { user } = renderForm(dueToday)
  await user.click(screen.getByRole('button', { name: 'Other' }))
  expect(dayChoices()).toEqual([
    ['Fri 13 Nov', 'Friday, 13 November', 'false'],
    ['Sat 14 Nov', 'Saturday, 14 November', 'false'],
  ])
})

test('a dose due three days ago offers its due day and the days either side', async () => {
  const { user } = renderForm(dueThreeDaysAgo)
  await user.click(screen.getByRole('button', { name: 'Other' }))
  expect(dayChoices().map(([, name]) => name)).toEqual([
    'Tuesday, 10 November',
    'Wednesday, 11 November',
    'Thursday, 12 November',
  ])
})

// Regression: a new record pre-filled a day, so it could save a day the user never chose.
test('a new record saves only once a day is chosen', async () => {
  const { user, onSubmit } = renderForm(dueThreeDaysAgo)
  await user.click(screen.getByRole('button', { name: 'Other' }))
  await user.click(screen.getByRole('button', { name: 'Save as taken' }))
  expect(await screen.findByText('Choose a date.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Tuesday, 10 November' })).toHaveFocus()
  expect(onSubmit).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Wednesday, 11 November' }))
  await user.click(screen.getByRole('button', { name: 'Save as taken' }))
  // Other starts at the current time: 14:00 on 11 November in Istanbul.
  expect(onSubmit).toHaveBeenCalledWith(
    { takenAt: '2026-11-11T11:00:00.000Z', quantity: 1 },
    expect.anything(),
  )
})

test('a change starts on its saved day', () => {
  renderForm(
    {
      ...dueThreeDaysAgo,
      status: 'Taken',
      record: {
        outcome: 'Taken',
        scheduleId: 'schedule',
        dueAt: dueThreeDaysAgo.dueAt,
        takenAt: '2026-11-12T05:30:00.000Z',
        quantity: 1,
        revision: 0,
      },
    } as DoseOccurrence,
    'edit',
  )
  expect(screen.getByRole('button', { name: 'Thursday, 12 November' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByRole('button', { name: 'Wednesday, 11 November' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})
