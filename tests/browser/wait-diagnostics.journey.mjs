export const dependencies = { auth: false, storage: false }

export async function run({ browser, origin }) {
  browser.step('wait for a deliberately missing element')
  await browser.open(origin)
  await browser.run('wait', '#deliberately-missing')
}
