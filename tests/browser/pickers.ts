import { expect, type Locator, type Page } from '@playwright/test'
import { calendarDay, firstCalendarDay } from './locators'

/** The trigger of a date picker; its accessible name starts with the field label. */
export const datePicker = (scope: Page | Locator, label: string) =>
  scope.getByRole('button', { name: new RegExp(`^${label}, `) })

/** Open a date picker, move to the month of `date` and choose that day. */
export async function pickDate(page: Page, label: string, date: string) {
  await datePicker(page, label).click()
  const calendar = page.getByRole('dialog', { name: label })
  await expect(calendar).toBeVisible()
  const day = calendarDay(calendar, date)
  for (let step = 0; step < 240 && !(await day.isVisible()); step++) {
    const shown = await firstCalendarDay(calendar).getAttribute('data-day')
    await calendar
      .getByRole('button', { name: shown! > date ? /previous month/i : /next month/i })
      .click()
  }
  await day.click()
  await expect(calendar).toBeHidden()
}

/** The hour and minute selects of a time picker. */
export const timePicker = (scope: Page | Locator, label: string) => ({
  hour: scope.getByRole('combobox', { name: `${label} hour` }),
  minute: scope.getByRole('combobox', { name: `${label} minute` }),
})

/** Choose 'HH:MM' in a time picker. */
export async function pickTime(page: Page, label: string, time: string) {
  const { hour, minute } = timePicker(page, label)
  const [hh, mm] = time.split(':')
  for (const [trigger, value] of [
    [hour, hh],
    [minute, mm],
  ] as const) {
    await trigger.click()
    await page.getByRole('option', { name: value, exact: true }).click()
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(trigger).toHaveText(value)
  }
}

/** Assert a time picker shows 'HH:MM'. */
export async function expectTime(scope: Page | Locator, label: string, time: string) {
  const { hour, minute } = timePicker(scope, label)
  const [hh, mm] = time.split(':')
  await expect(hour).toHaveText(hh)
  await expect(minute).toHaveText(mm)
}
