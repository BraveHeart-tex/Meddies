import { expect, test } from 'vitest'
import type { DailySchedule } from '../src/features/schedules/contract'
import type { ScheduleSnapshot } from '../src/features/schedules/queries'
import {
  reminderHistoryDate,
  reminderDueAt,
  reminderDueLink,
  reminderLink,
  reminderOccurrence,
} from '../src/features/schedules/reminder-link'
import {
  groupedReminderDestination,
  historyListsReminder,
  reminderDestination,
} from '../src/features/schedules/reminder-destination'
import { scheduleHistoryDay } from '../src/features/schedules/occurrences'

const scheduleId = 'c0c22213-a56e-42f5-859b-1d5ba320c036'
const schedule = {
  id: scheduleId,
  medicineId: '00000000-0000-4000-8000-000000000001',
  startDate: '2026-11-01',
  times: [{ time: '09:00', quantity: 1 }],
} as DailySchedule
const occurrenceAt = (dueAt: string) => `${scheduleId}:${new Date(dueAt).toISOString()}`
const snapshot = (now: string): ScheduleSnapshot => ({
  schedules: [schedule],
  records: [],
  now: new Date(now).toISOString(),
  date: now.slice(0, 10),
})

// Regression: the builder and the reader must agree, or a sent reminder opens nothing.
test('a Reminder link names the Occurrence by schedule and due instant only', () => {
  const link = reminderLink({
    scheduleId: scheduleId.toUpperCase(),
    dueAt: '2026-11-17T09:00:00+03:00',
  })
  expect(link).toBe(`/?occurrence=${encodeURIComponent(`${scheduleId}:2026-11-17T06:00:00.000Z`)}`)
  const value = new URLSearchParams(link.slice(2)).get('occurrence')
  expect(reminderOccurrence(value)).toBe(`${scheduleId}:2026-11-17T06:00:00.000Z`)
  expect(reminderHistoryDate(reminderOccurrence(value)!)).toBe('2026-11-17')
})

test.each([
  undefined,
  ['a', 'b'],
  '',
  scheduleId,
  `not-a-uuid:2026-11-17T06:00:00.000Z`,
  `${scheduleId}:2026-11-17T06:00:00Z`,
  `${scheduleId}:2026-02-30T06:00:00.000Z`,
  `${scheduleId}:2026-11-17T06:00:00.000Z&x`,
])('rejects a value that is not a Reminder link occurrence: %s', (value) => {
  expect(reminderOccurrence(value)).toBeNull()
})

test('an Occurrence Today lists opens on Today', () => {
  expect(
    reminderDestination(
      occurrenceAt('2026-11-17T09:00:00+03:00'),
      snapshot('2026-11-17T10:00:00+03:00'),
    ),
  ).toBe('today')
})

// Regression: a resolved or older dose must not land on Today, where no row can open it.
test('an Occurrence Today no longer lists opens History for its due day', () => {
  const occurrence = occurrenceAt('2026-11-15T09:00:00+03:00')
  expect(reminderDestination(occurrence, snapshot('2026-11-17T10:00:00+03:00'))).toBe(
    `/history?date=2026-11-15&occurrence=${encodeURIComponent(occurrence)}`,
  )
})

test('a future due day or a failed Today read lands on Today with no drawer', () => {
  const tomorrow = occurrenceAt('2026-11-20T09:00:00+03:00')
  expect(reminderDestination(tomorrow, snapshot('2026-11-17T10:00:00+03:00'))).toBe('/')
  expect(reminderDestination(occurrenceAt('2026-11-17T09:00:00+03:00'), undefined)).toBe('/')
})

// Regression: an unknown or another account's Occurrence must never open a drawer.
test('History opens only an Occurrence its owner-scoped read lists on that date', () => {
  const now = new Date('2026-11-17T10:00:00+03:00')
  const doses = scheduleHistoryDay([schedule], '2026-11-15', now, [])
  const own = occurrenceAt('2026-11-15T09:00:00+03:00')
  expect(historyListsReminder(own, '2026-11-15', doses)).toBe(true)
  expect(historyListsReminder(own, '2026-11-14', doses)).toBe(false)
  const otherAccount = `00000000-0000-4000-8000-0000000000ff:${new Date('2026-11-15T09:00:00+03:00').toISOString()}`
  expect(historyListsReminder(otherAccount, '2026-11-15', doses)).toBe(false)
  expect(historyListsReminder(occurrenceAt('2026-11-15T10:00:00+03:00'), '2026-11-15', doses)).toBe(
    false,
  )
  expect(historyListsReminder(own, '2026-11-15', undefined)).toBe(false)
})

const dueAt = '2026-11-17T06:00:00.000Z'
const now = new Date('2026-11-17T10:00:00+03:00')
const dueDestination = (value: unknown) => groupedReminderDestination(reminderDueAt(value), now)

// Regression: the grouped builder and reader must agree, or a grouped reminder opens nothing.
test('a grouped Reminder link names the due instant only', () => {
  const link = reminderDueLink('2026-11-17T09:00:00+03:00')
  expect(link).toBe(`/?due=${encodeURIComponent(dueAt)}`)
  expect(reminderDueAt(new URLSearchParams(link.slice(2)).get('due'))).toBe(dueAt)
})

// Regression: a grouped link must open the listing screen, never a drawer or a stale `due`.
test('a grouped Reminder link due today opens Today with no parameter left', () => {
  expect(dueDestination(dueAt)).toBe('/')
})

test('a grouped Reminder link due before today opens History for that day', () => {
  expect(dueDestination('2026-11-14T21:30:00.000Z')).toBe('/history?date=2026-11-15')
})

test.each([
  undefined,
  ['a', 'b'],
  '',
  `${scheduleId}:${dueAt}`,
  '2026-11-17T06:00:00Z',
  '2026-02-30T06:00:00.000Z',
  '2026-11-17T21:00:00.000Z',
])('a malformed or future grouped Reminder link opens Today: %s', (value) => {
  expect(dueDestination(value)).toBe('/')
})
