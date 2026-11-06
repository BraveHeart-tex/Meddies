import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calendarDay, dateLabel, dateValue } from '../src/lib/calendar-date.ts'

const zones = ['Pacific/Kiritimati', 'America/Los_Angeles', 'Pacific/Pago_Pago', 'Europe/Istanbul']

function inZone(zone, run) {
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

test('date labels name the Istanbul day in any device timezone', () => {
  for (const zone of zones)
    inZone(zone, () => {
      assert.equal(dateLabel('2035-06-15'), 'Fri, 15 Jun 2035', zone)
      assert.equal(dateLabel('2036-01-01'), 'Tue, 1 Jan 2036', zone)
    })
})
