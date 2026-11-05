import assert from 'node:assert/strict'

export function setTime(run, selector, value) {
  // Chromium's segmented time control does not accept agent-browser fill.
  run(
    'eval',
    `(() => {
      const field = document.querySelector(${JSON.stringify(selector)})
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(value)})
      field.dispatchEvent(new Event('input', { bubbles: true }))
      field.dispatchEvent(new Event('change', { bubbles: true }))
    })()`,
  )
  const actual = run('get', 'value', selector).trim()
  assert.equal(
    actual,
    value,
    `Time input ${selector}: expected ${JSON.stringify(value)}, actual ${JSON.stringify(actual)}`,
  )
}
