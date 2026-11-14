import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import type { DoseOccurrence } from '../src/features/schedules/contract'
import { DoseSaveProblem } from '../src/features/schedules/dose-save-problem'
import type { SaveProblem } from '../src/features/schedules/dose-saves'
import { RecordedElsewhere } from '../src/features/schedules/recorded-outcome'
import { SchedulingClockProvider } from '../src/features/schedules/scheduling-clock'
import { TakenForm } from '../src/features/schedules/taken-form'
import { createQueryClient } from '../src/lib/session-query-client'

const uncertain: SaveProblem = { kind: 'uncertain', checked: false }
const problemText = (props: Partial<Parameters<typeof DoseSaveProblem>[0]>) => {
  render(<DoseSaveProblem id="problem" outcome="Taken" problem={null} offline={false} {...props} />)
  return screen.getByRole('alert')
}

describe('an unconfirmed save', () => {
  test('never reads as failed and says what is safe', () => {
    const alert = problemText({ problem: uncertain })
    expect(alert).toHaveTextContent(
      "That might not have saved.Your details are still here. Check your connection and try again. It won't save twice.",
    )
    expect(alert).not.toHaveTextContent(/failed|not saved/i)
  })

  test('says Meddies looked once a check found nothing', () => {
    expect(problemText({ problem: { kind: 'uncertain', checked: true } })).toHaveTextContent(
      "Meddies checked and can't find it yet.",
    )
  })

  test('only says details are still here when the form holds details', () => {
    expect(problemText({ outcome: 'Skipped', problem: uncertain })).not.toHaveTextContent(
      'Your details are still here.',
    )
  })

  test('warns that changed details start a new save', () => {
    expect(problemText({ problem: uncertain, changed: true })).toHaveTextContent(
      'Changing details starts a new save.',
    )
  })
})

test.each([
  ['Taken', "You're offline. Your details stay here. Save once you're back online."],
  ['Skipped', "You're offline. Nothing is saved yet. Save once you're back online."],
] as const)('offline on the %s form', (outcome, text) => {
  render(<DoseSaveProblem id="problem" outcome={outcome} problem={null} offline />)
  expect(screen.getByText(text)).toBeVisible()
})

test.each([
  [
    'Taken',
    'Not saved.The time taken has to be in the past and within a day of the dose. Change the time and save again.',
  ],
  [
    'Skipped',
    "Not saved.This dose can't be skipped any more. Refresh Today to see where it stands.",
  ],
] as const)('a rejected %s save', (outcome, text) => {
  expect(problemText({ outcome, problem: { kind: 'rejected' } })).toHaveTextContent(text)
})

const base = {
  id: 'dose',
  scheduleId: 'schedule',
  medicineId: 'medicine',
  dueAt: '2026-11-05T06:00:00.000Z',
  quantity: 1,
}
const key = { scheduleId: base.scheduleId, dueAt: base.dueAt }

test.each([
  [
    'taken',
    {
      ...base,
      status: 'Taken',
      record: { ...key, outcome: 'Taken', takenAt: '2026-11-05T06:05:00.000Z', quantity: 1 },
    },
    "This dose was saved as taken at 09:05 while your form was open. Your details are still here. Check what's saved before you save again.",
  ],
  [
    'skipped',
    {
      ...base,
      status: 'Skipped',
      record: { ...key, outcome: 'Skipped', recordedAt: '2026-11-05T06:05:00.000Z' },
    },
    "This dose was saved as skipped while your form was open. Your details are still here. Check what's saved before you save again.",
  ],
] as const)('a dose saved as %s while the form was open', (_, dose, text) => {
  render(<RecordedElsewhere dose={dose} />)
  expect(screen.getByRole('status')).toHaveTextContent(text)
})

test.each([
  ['record', 'Try saving as taken again'],
  ['edit', 'Try saving changes again'],
  ['correct', 'Try saving your change again'],
] as const)('the %s form offers its retry in plain words', (mode, name) => {
  const medicine: Medicine = { id: 'medicine', label: 'Iron', strength: null, unit: 'tablet' }
  const dose: DoseOccurrence = {
    ...base,
    status: 'Taken',
    record: { ...key, outcome: 'Taken', takenAt: '2026-11-05T06:05:00.000Z', quantity: 1 },
  }
  render(
    <QueryClientProvider client={createQueryClient()}>
      <SchedulingClockProvider serverNow="2026-11-05T06:10:00.000Z">
        <TakenForm
          dose={dose}
          medicine={medicine}
          open
          saving={false}
          problem={uncertain}
          onOpen={() => {}}
          onSubmit={async () => {}}
          mode={mode}
          restore={{
            values: { when: 'now', date: '', time: '', quantity: '1' },
            now: '2026-11-05T09:10',
          }}
        />
      </SchedulingClockProvider>
    </QueryClientProvider>,
  )
  expect(screen.getByRole('button', { name })).toBeVisible()
})
