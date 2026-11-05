import assert from 'node:assert/strict'

export async function setTime(run, selector, value) {
  // Chromium's segmented date and time controls do not accept agent-browser fill.
  await run(
    'eval',
    `(() => {
      const field = document.querySelector(${JSON.stringify(selector)})
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(value)})
      field.dispatchEvent(new Event('input', { bubbles: true }))
      field.dispatchEvent(new Event('change', { bubbles: true }))
    })()`,
  )
  const actual = (await run('get', 'value', selector)).trim()
  assert.equal(
    actual,
    value,
    `Time input ${selector}: expected ${JSON.stringify(value)}, actual ${JSON.stringify(actual)}`,
  )
}

// Focus a button by its visible text and activate it from the keyboard. Native focus scrolls
// the control into view inside tall sheets, where pointer clicks can land on the backdrop.
export async function pressButton(run, text) {
  const found = await run(
    'eval',
    `(() => {
      const button = [...document.querySelectorAll('button')].find(
        (item) => item.innerText.trim() === ${JSON.stringify(text)} && item.offsetParent !== null,
      )
      button?.focus()
      return Boolean(button) && document.activeElement === button
    })()`,
  )
  assert.equal(found.trim(), 'true', `Button with text ${JSON.stringify(text)} must be focusable`)
  await run('press', 'Enter')
}
