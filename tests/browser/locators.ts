import type { Locator, Page } from '@playwright/test'
import { formatLongDay } from '../../src/lib/calendar-date'

// Shared domain locators. Prefer role, then label, then text; fall back to a domain data-*
// id only when no accessible handle exists. Raw CSS selectors are allowed only in this file.

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The open dose drawer. Toasts are dialogs too, so match the drawer popup only. */
export const drawer = (page: Page) =>
  page.getByRole('dialog').and(page.locator('[data-slot="drawer-popup"]'))

/** A confirmation toast, matched by its text. */
export const toastMessage = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: 'Notifications' }).getByText(text)

/** A Today row, keyed by its scheduled instant (ISO string). */
export const doseRow = (page: Page, dueAt: string) =>
  page.locator(`li[data-dose-id]:has(time[datetime="${dueAt}"])`)

/** The Record/Review dose button for a medicine. Its accessible description is the status. */
export const doseTrigger = (scope: Page | Locator, label?: string) =>
  scope.getByRole('button', {
    name: new RegExp(`^(Record|Review) dose for ${label ? escapeRegExp(label) : ''}`),
  })

/** The focused element inside a row: focus returned to it after its drawer closed. */
export const focusInside = (row: Locator) => row.locator(':focus')

/** A rendered instant, for example a recorded intake time inside a row. */
export const instant = (scope: Page | Locator, iso: string) =>
  scope.locator(`time[datetime="${iso}"]`)

/** The History list for a date. Journey dates share the frozen clock's year, so none shows. */
export const historyList = (page: Page, date: string) =>
  page.getByRole('list', { name: `Doses for ${formatLongDay(date, date)}` })

/** History's date bar: Previous day, the DatePicker and Next day. */
export const historyDateNav = (page: Page) => page.getByRole('navigation', { name: 'History date' })

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

/** A calendar day button inside an open date picker, keyed by its date-only value. */
export const calendarDay = (scope: Page | Locator, date: string) =>
  scope.locator(`button[data-day="${date}"]`)

/** The first day shown by an open date picker, to tell which month it displays. */
export const firstCalendarDay = (scope: Page | Locator) => scope.locator('button[data-day]').first()

/** Loading placeholders. They must stay hidden from assistive technology. */
export const placeholders = (page: Page) => page.locator('[data-slot="skeleton"]')

/** The cold launch fallback (109·L1), shown while a route's server reads are held. */
export const rootFallback = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Opening Meddies' })

/** The Today dose list. */
export const todaysDoses = (page: Page) => page.getByRole('list', { name: "Today's doses" })

/** The page header (title row and page action). It sits inside `main`, so it is not a banner. */
export const appHeader = (page: Page) => page.locator('main header').first()

/** Today's doses section fallback, shown while its server reads are held. */
export const todayFallback = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Loading today’s doses' })

/** History's results fallback, shown while a date's reads are held. */
export const historyFallback = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Loading history' })

/** The box History's results fallback occupies; its status is a visually hidden line. */
export const historyFallbackSection = (page: Page) =>
  page.locator('[data-slot="loading-section"]').filter({ has: historyFallback(page) })

/** History's route fallback, before the page and its date bar resolve. */
export const historyRouteFallback = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Opening History' })

/** Settings' route fallback, before the session resolves. */
export const settingsRouteFallback = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Opening Settings' })

/** The sign-in error page's route fallback, before the error is read. */
export const signInRouteFallback = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Opening sign-in' })

/** The sign-in card, real or placeholder; its edges show whether the alert above it held still. */
export const signInCard = (page: Page) => page.locator('main [data-slot="card"]')

/** Any selected primary destination; recovery pages outside the app have none. */
export const selectedNavigation = (page: Page) =>
  page.getByRole('navigation', { name: 'Primary' }).locator('a[aria-current="page"]')

/** The Medications list fallback, shown while its reads are held. */
export const medicationsFallback = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Loading medications' })

/** The medication page's fallback. The exact match keeps it apart from the list's. */
export const medicationFallback = (page: Page) =>
  page.getByRole('status').filter({ hasText: /^Loading medication$/ })

/** Schedule setup's fallback: the medication page's header above a form-area block. */
export const medicationSetupFallback = (page: Page) =>
  page.getByRole('status').filter({ hasText: /^Loading schedule setup$/ })

/** Any loading fallback's status, such as `Loading medications`. */
export const loadingStatus = (page: Page) =>
  page.getByRole('status').filter({ hasText: /^Loading/ })

/** The loaded Medications list section. */
export const medicationsList = (page: Page) =>
  page.getByRole('region', { name: 'Your medications' })

/** The fallback's four row placeholders. */
export const medicationsFallbackSection = (page: Page) =>
  page.locator('[data-slot="loading-section"]').filter({ has: medicationsFallback(page) })
