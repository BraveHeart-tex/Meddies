import { describe, expect, test } from 'vitest'
import { safeReturnTo } from '../src/features/auth/return-to'
import {
  medicationsHref,
  medicationResumeHref,
  medicationSetupHref,
  parseMedicationsView,
} from '../src/features/medicines/routes'

const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'

describe('parseMedicationsView', () => {
  test.each([
    ['', { mode: 'list' }],
    ['?add', { mode: 'add' }],
    [`?medicine=${a}`, { mode: 'detail', medicineId: a }],
    [`?schedule=${a}`, { mode: 'setup', medicineId: a }],
    [`?resume=${a}`, { mode: 'resume', medicineId: a }],
    // Precedence: setup, then resume, then detail, then Add.
    [`?add&medicine=${a}&schedule=${b}`, { mode: 'setup', medicineId: b }],
    [`?resume=${a}&schedule=${b}`, { mode: 'setup', medicineId: b }],
    [`?medicine=${a}&resume=${b}`, { mode: 'resume', medicineId: b }],
    [`?add&medicine=${a}`, { mode: 'detail', medicineId: a }],
    // An invalid id falls through to the next view.
    [`?schedule=nope&medicine=${a}`, { mode: 'detail', medicineId: a }],
    ['?medicine=nope', { mode: 'list' }],
    ['?medicine=nope&add', { mode: 'add' }],
    // A repeated id is not one medicine.
    [`?medicine=${a}&medicine=${b}`, { mode: 'list' }],
  ])('reads %s from the browser URL', (search, view) => {
    expect(parseMedicationsView(new URLSearchParams(search))).toEqual(view)
  })

  test('reads the same views from server search params', () => {
    expect(parseMedicationsView({})).toEqual({ mode: 'list' })
    expect(parseMedicationsView({ add: '' })).toEqual({ mode: 'add' })
    expect(parseMedicationsView({ add: ['', ''] })).toEqual({ mode: 'add' })
    expect(parseMedicationsView({ schedule: a, add: '' })).toEqual({
      mode: 'setup',
      medicineId: a,
    })
    expect(parseMedicationsView({ medicine: [a, b] })).toEqual({ mode: 'list' })
  })
})

describe('medicationsHref', () => {
  test.each([
    [{ mode: 'list' } as const, '/medications'],
    [{ mode: 'add' } as const, '/medications?add'],
    [{ mode: 'detail', medicineId: a } as const, `/medications?medicine=${a}`],
    [{ mode: 'setup', medicineId: a } as const, `/medications?schedule=${a}`],
    [{ mode: 'resume', medicineId: a } as const, `/medications?resume=${a}`],
  ])('links %j', (view, href) => {
    expect(medicationsHref(view)).toBe(href)
  })

  test('setup links land on the schedule heading', () => {
    expect(medicationSetupHref(a)).toBe(`/medications?schedule=${a}#schedule-heading`)
    expect(medicationResumeHref(a)).toBe(`/medications?resume=${a}#schedule-heading`)
  })
})

describe('allowed sign-in return destinations', () => {
  test.each([
    '/medications',
    '/medications?add',
    `/medications?medicine=${a}`,
    `/medications?schedule=${a}`,
    `/medications?resume=${a}`,
  ])('keeps %s', (value) => expect(safeReturnTo(value)).toBe(value))

  test.each([
    '/medications?medicine=nope',
    '/medications?schedule=',
    `/medications?add&medicine=${a}`,
    `/medications?medicine=${a}#schedule-heading`,
    '//evil.example/medications',
  ])('rejects %s', (value) => expect(safeReturnTo(value)).toBe('/'))
})
