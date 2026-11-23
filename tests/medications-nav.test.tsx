import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  returnToMedicationPage,
  showMedicationsView,
} from '../src/features/medicines/medications-nav'
import {
  medicationManageHref,
  medicationRecordHref,
  medicationsHref,
} from '../src/features/medicines/routes'

const id = 'medicine-1'
const detail = medicationsHref({ mode: 'detail', medicineId: id })
const manage = medicationManageHref(id)
const edit = medicationRecordHref(id, 'fix', 'period-1')

/** What Next.js's HistoryUpdater writes when a router update does not preserve custom state. */
const nextRewrite = (url: string) =>
  window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {} }, '', url)

beforeEach(() => {
  window.history.replaceState(null, '', '/medications')
  showMedicationsView(detail)
  showMedicationsView(manage)
  showMedicationsView(edit)
})

afterEach(() => vi.restoreAllMocks())

// Regression (#471): a Next.js retry after Back/Forward dropped the origin, so saving replaced
// the edit entry and one Back from Medication detail landed on Manage.
test('a Next.js rewrite of the current entry keeps its Medications origin', () => {
  nextRewrite(edit)
  expect(window.history.state).toMatchObject({
    __NA: true,
    medicationsFrom: manage,
    medicationsFromBefore: detail,
  })
})

test('a save after that rewrite returns to Medication detail by going back two entries', () => {
  const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
  nextRewrite(edit)
  returnToMedicationPage(id)
  expect(go).toHaveBeenCalledWith(-2)
})

test('a Next.js replace to another URL does not inherit the origin', () => {
  nextRewrite(detail)
  expect(window.history.state?.medicationsFrom).toBeUndefined()
})
