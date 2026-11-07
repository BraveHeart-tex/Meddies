import { expect, test } from './fixtures'
import { scrollsHorizontally, waitForClientRouter } from './actions'

test.use({ hasTouch: true, journey: { auth: true, storage: true } })

const isSave = (method: string, url: URL) => method === 'POST' && url.pathname === '/api/medicines'

test('add a medicine: validation, failures keep values, retry saves once, handoff', async ({
  page,
}) => {
  const name = page.getByLabel('Medicine name')
  const strength = page.getByLabel(/^Product strength/)
  const unitGroup = page.getByRole('group', { name: 'Unit' })
  const tablet = page.getByRole('button', { name: 'Tablet' })
  const capsule = page.getByRole('button', { name: 'Capsule' })
  const save = page.getByRole('button', { name: 'Save medicine' })
  const label = `Add Journey Medicine ${'L'.repeat(60)}`
  const posted: string[] = []
  page.on('request', (request) => {
    if (isSave(request.method(), new URL(request.url()))) posted.push(request.postData() ?? '')
  })

  await test.step('open Add from the list with nothing preselected', async () => {
    await page.goto('/medications')
    await waitForClientRouter(page)
    await page.getByRole('link', { name: 'Add a medicine' }).click()
    await expect(page).toHaveURL(/\/medications\?add$/)
    await expect(page.getByRole('heading', { name: 'Add medicine' })).toBeVisible()
    await expect(tablet).toHaveAttribute('aria-pressed', 'false')
    await expect(capsule).toHaveAttribute('aria-pressed', 'false')
    await expect(unitGroup).toHaveAccessibleDescription(/whole or half tablets/)
    for (const control of [tablet, capsule, save])
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  })

  await test.step('submit-first validation focuses the first invalid field', async () => {
    await strength.fill('x'.repeat(121))
    await expect(page.getByText('Use 120 characters or fewer.')).toBeHidden()
    await save.click()
    await expect(name).toBeFocused()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toHaveAccessibleDescription(/Enter the medicine name\./)
    await expect(strength).toHaveAccessibleDescription(/Use 120 characters or fewer\./)
    await expect(unitGroup).toHaveAccessibleDescription(/Choose tablet or capsule\./)
    expect(posted).toHaveLength(0)
  })

  await test.step('errors clear as fields are corrected', async () => {
    await name.fill(label)
    await expect(name).not.toHaveAttribute('aria-invalid', 'true')
    await strength.fill(' 5 mg ')
    await expect(page.getByText('Use 120 characters or fewer.')).toBeHidden()
    await save.click()
    await expect(tablet).toBeFocused()
    await capsule.tap()
    await expect(capsule).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Choose tablet or capsule.')).toBeHidden()
    expect(await scrollsHorizontally(page)).toBe(false)
  })

  await test.step('a rejected save keeps values and offers a fresh save', async () => {
    await page.route(
      (url) => url.pathname === '/api/medicines',
      (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({ status: 400, json: { error: 'validation' } })
          : route.fallback(),
      { times: 1 },
    )
    await save.click()
    await expect(page.getByText(`${label} wasn't saved.`)).toBeVisible()
    await expect(name).toHaveValue(label)
    await expect(strength).toHaveValue(' 5 mg ')
    await expect(capsule).toHaveAttribute('aria-pressed', 'true')
    await expect(save).toBeEnabled()
  })

  await test.step('an unconfirmed save keeps values and retries the same request', async () => {
    // Fail before the server sees it, so the reconciling list read finds nothing.
    await page.route(
      (url) => url.pathname === '/api/medicines',
      (route) =>
        route.request().method() === 'POST' ? route.abort('connectionfailed') : route.fallback(),
      { times: 1 },
    )
    await save.click()
    await expect(page.getByText('Save could not be confirmed.')).toBeVisible()
    await expect(name).toHaveValue(label)
    const retry = page.getByRole('button', { name: 'Retry saving medicine' })
    await expect(retry).toHaveAccessibleDescription(/Retry saves .* once/)

    // Hold the retry to observe the pending state and a second activation.
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(
      (url) => url.pathname === '/api/medicines',
      async (route) => {
        if (route.request().method() !== 'POST') return route.fallback()
        await held
        await route.fallback()
      },
      { times: 1 },
    )
    // Two rapid activations before the pending render: the synchronous guard sends one.
    await retry.dblclick()
    const saving = page.getByRole('button', { name: 'Saving medicine...' })
    await expect(saving).toBeDisabled()
    await expect(name).toBeDisabled()
    await expect(capsule).toBeDisabled()
    release()

    await expect(page).toHaveURL(/\/medications\?medicine=[\w-]+$/)
    // 400 attempt, aborted attempt, one retry; the second click sent nothing.
    expect(posted).toHaveLength(3)
    const [, aborted, retried] = posted.map((body) => JSON.parse(body).id)
    expect(retried).toBe(aborted)
  })

  await test.step('the saved handoff replaces Add and focuses the medicine', async () => {
    await expect(page.getByRole('heading', { name: label })).toBeFocused()
    await expect(page.getByRole('status').filter({ hasText: `${label} saved.` })).toBeVisible()
    await expect(page.getByText('Product strength: 5 mg')).toBeVisible()
    await expect(page.getByText('Unit: capsule')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Set schedule' }).first()).toHaveAttribute(
      'href',
      /\/medications\?schedule=[\w-]+/,
    )
    await page.getByRole('link', { name: 'Done for now' }).click()
    await expect(page).toHaveURL(/\/medications$/)
    await expect(page.getByRole('link', { name: `View details for ${label}` })).toHaveCount(1)
    await page.goBack()
    await expect(page).toHaveURL(/\/medications\?medicine=/)
    await expect(page.getByText(`${label} saved.`)).toBeHidden()
  })
})

test('a lost save response is reconciled before claiming failure', async ({ page }) => {
  await page.goto('/medications?add')
  await page.getByLabel('Medicine name').fill('Lost Response Medicine')
  await page.getByRole('button', { name: 'Tablet' }).click()
  // The save reaches the server, but its response is lost on the way back.
  await page.route(
    (url) => url.pathname === '/api/medicines',
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      await route.fetch()
      await route.abort('connectionfailed')
    },
    { times: 1 },
  )
  await page.getByRole('button', { name: 'Save medicine' }).click()
  await expect(page.getByText('Lost Response Medicine saved.')).toBeVisible()
  await expect(page.getByText('Save could not be confirmed.')).toBeHidden()
})

test('a conflict locks the form and offers Medications', async ({ page }) => {
  await page.goto('/medications?add')
  await page.getByLabel('Medicine name').fill('Conflict Medicine')
  await page.getByRole('button', { name: 'Capsule' }).click()
  await page.route(
    (url) => url.pathname === '/api/medicines',
    (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 409, json: { error: 'conflict' } })
        : route.fallback(),
  )
  await page.getByRole('button', { name: 'Save medicine' }).click()
  await expect(
    page.getByText('A different version of this save is already recorded.'),
  ).toBeVisible()
  await expect(page.getByLabel('Medicine name')).toBeDisabled()
  await expect(page.getByRole('button', { name: /save medicine/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Open Medications' })).toHaveAttribute(
    'href',
    '/medications',
  )
})

test('known offline waits for a connection and keeps values', async ({ page, context }) => {
  await page.goto('/medications?add')
  await page.getByLabel('Medicine name').fill('Offline Medicine')
  await context.setOffline(true)
  const connect = page.getByRole('button', { name: 'Connect to save' })
  await expect(connect).toBeDisabled()
  await expect(page.getByText("You're offline.")).toBeVisible()
  await page.getByLabel(/^Product strength/).fill('10 mg')
  await expect(page.getByLabel('Medicine name')).toHaveValue('Offline Medicine')
  await context.setOffline(false)
  await expect(page.getByRole('button', { name: 'Save medicine' })).toBeEnabled()
  await expect(page.getByText("You're offline.")).toBeHidden()
})

test('Add keeps a session draft across routes, clears explicitly and after confirmed save', async ({
  page,
}) => {
  await page.goto('/medications?add')
  const name = page.getByLabel('Medicine name')
  const strength = page.getByLabel(/^Product strength/)
  const note = page.getByText('Unsaved details from earlier.')
  const openAdd = async () => {
    await page.getByRole('link', { name: 'Medications', exact: true }).first().click()
    await page.getByRole('link', { name: 'Add a medicine' }).click()
  }
  await expect(note).toBeHidden()
  await name.fill('Draft medicine')
  await strength.fill(' 25 mg ')
  await page.getByRole('button', { name: 'Capsule' }).click()
  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await openAdd()
  await expect(name).toHaveValue('Draft medicine')
  await expect(strength).toHaveValue(' 25 mg ')
  await expect(page.getByRole('button', { name: 'Capsule' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(note).toBeVisible()
  await page.getByRole('button', { name: 'Clear form' }).click()
  await expect(name).toHaveValue('')
  await expect(strength).toHaveValue('')
  await expect(note).toBeHidden()
  await openAdd()
  await expect(note).toBeHidden()
  await name.fill('Confirmed draft medicine')
  await page.getByRole('button', { name: 'Tablet' }).click()
  await openAdd()
  await expect(note).toBeVisible()
  await page.getByRole('button', { name: 'Save medicine' }).click()
  await expect(page.getByText('Confirmed draft medicine saved.')).toBeVisible()
  await page.getByRole('link', { name: 'Done for now' }).click()
  await page.getByRole('link', { name: 'Add a medicine' }).click()
  await expect(name).toHaveValue('')
  await expect(note).toBeHidden()
})
