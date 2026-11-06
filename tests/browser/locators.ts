import type { Locator, Page } from '@playwright/test'

// Shared domain locators. Prefer role, then label, then text; fall back to a domain data-*
// id only when no accessible handle exists. Raw CSS selectors are allowed only in this file.

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The open dose drawer. */
export const drawer = (page: Page) => page.getByRole('dialog')

/** A Today row, keyed by its scheduled instant (ISO string). */
export const doseRow = (page: Page, dueAt: string) =>
  page.locator(`li[data-dose-id]:has(time[datetime="${dueAt}"])`)

/** The Record/Review dose button for a medicine. Its accessible description is the status. */
export const doseTrigger = (scope: Page | Locator, label?: string) =>
  scope.getByRole('button', {
    name: new RegExp(`^(Record|Review) dose for ${label ? escapeRegExp(label) : ''}`),
  })

/** A rendered instant, for example a recorded intake time inside a row. */
export const instant = (scope: Page | Locator, iso: string) =>
  scope.locator(`time[datetime="${iso}"]`)

/** The History list for a date. */
export const historyList = (page: Page, date: string) =>
  page.getByRole('list', { name: `Doses for ${date}` })

/** History rows for a date. */
export const historyRows = (page: Page, date: string) =>
  historyList(page, date).getByRole('listitem')

/** A History row, keyed by its scheduled instant (ISO string). */
export const historyRow = (page: Page, date: string, dueAt: string) =>
  historyRows(page, date).filter({ has: instant(page, dueAt) })

/** The actual intake time of a Taken History row. */
export const intakeTime = (row: Locator) => row.locator('time[data-dose-intake-time]')

/**
 * The Record/Review trigger of a Today row, including while the modal drawer hides the
 * background. Assert status with toHaveAccessibleDescription: it describes the trigger.
 */
export const doseStatus = (row: Locator) =>
  row.getByRole('button', { name: /^(Record|Review) dose for /, includeHidden: true })

/** The open drawer's swipe handle. It is decorative to assistive tech but drives pointer swipes. */
export const drawerHandle = (page: Page) => page.locator('[data-slot="drawer-swipe-handle"]')
