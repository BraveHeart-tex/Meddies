export const dependencies = { auth: false, storage: false }

export function run({ browser, origin }) {
  browser.step('wait for a deliberately missing element')
  browser.open(origin)
  browser.run('wait', '#deliberately-missing')
}
