import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  calendarDay,
  dateValue,
  formatLongDay,
  formatMonthName,
  formatMonthYear,
  formatShortDay,
  formatShortWeekday,
  formatTime,
  formatTodayRelativeDay,
  formatWeekdayName,
  istanbulHour,
} from '../src/lib/calendar-date'

const zones = ['Pacific/Kiritimati', 'America/Los_Angeles', 'Pacific/Pago_Pago', 'Europe/Istanbul']

function inZone(zone: string, run: () => void) {
  const previous = process.env.TZ
  process.env.TZ = zone
  try {
    run()
  } finally {
    process.env.TZ = previous
  }
}

test('date-only values round-trip through the calendar in any device timezone', () => {
  for (const zone of zones)
    inZone(zone, () => {
      for (const value of ['2035-06-15', '2035-01-01', '2035-12-31', '2099-12-31', '2036-03-30'])
        assert.equal(dateValue(calendarDay(value)), value, `${value} in ${zone}`)
      assert.equal(calendarDay('2035-06-15').getDate(), 15, zone)
    })
})

test('each format names the Istanbul day in any device timezone', () => {
  for (const zone of zones)
    inZone(zone, () => {
      assert.equal(formatShortDay('2035-06-14', '2035-06-15'), 'Thu 14 Jun', zone)
      assert.equal(formatLongDay('2035-06-14', '2035-06-15'), 'Thursday, 14 June', zone)
      assert.equal(formatTodayRelativeDay('2035-06-15', '2035-06-15'), 'Today, Fri 15 Jun', zone)
      assert.equal(formatTodayRelativeDay('2035-06-14', '2035-06-15'), 'Thu 14 Jun', zone)
    })
})

test('an instant reads as its Istanbul day, not the device day', () => {
  // 21:30Z on 14 June is already 00:30 on 15 June in Istanbul.
  const instant = '2035-06-14T21:30:00.000Z'
  for (const zone of zones)
    inZone(zone, () => {
      assert.equal(formatShortDay(instant, '2035-06-20'), 'Fri 15 Jun', zone)
      assert.equal(formatLongDay(instant, '2035-06-20'), 'Friday, 15 June', zone)
      assert.equal(formatTodayRelativeDay(instant, instant), 'Today, Fri 15 Jun', zone)
      assert.equal(formatTime(instant), '00:30', zone)
    })
})

test('the year shows only outside the current Istanbul year', () => {
  assert.equal(formatShortDay('2036-01-01', '2035-06-15'), 'Tue 1 Jan 2036')
  assert.equal(formatShortDay('2034-12-31', '2035-01-01'), 'Sun 31 Dec 2034')
  assert.equal(formatLongDay('2036-01-01', '2035-06-15'), 'Tuesday, 1 January 2036')
  assert.equal(formatTodayRelativeDay('2036-01-01', '2035-06-15'), 'Tue 1 Jan 2036')
  // New Year's Eve 22:00Z is already next year in Istanbul.
  assert.equal(formatShortDay('2036-01-01', '2035-12-31T22:00:00.000Z'), 'Tue 1 Jan')
})

test('times are 24-hour Istanbul times and midnight reads 00:00', () => {
  assert.equal(formatTime('2035-06-15T11:05:00.000Z'), '14:05')
  assert.equal(formatTime(Date.UTC(2035, 5, 15, 21, 0)), '00:00')
  assert.equal(istanbulHour('2035-06-15T21:00:00.000Z'), 0)
  assert.equal(istanbulHour('2035-06-15T15:00:00.000Z'), 18)
})

test('calendar labels read a date-only value in any device timezone', () => {
  for (const zone of zones)
    inZone(zone, () => {
      assert.equal(formatMonthYear('2035-06-01'), 'June 2035', zone)
      assert.equal(formatMonthName('2035-06-01'), 'Jun', zone)
      assert.equal(formatShortWeekday('2035-06-04'), 'Mon', zone)
      assert.equal(formatWeekdayName('2035-06-04'), 'Monday', zone)
    })
})
