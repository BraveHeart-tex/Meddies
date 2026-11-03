// FE-550: disposable, memory-only interaction study. No application imports or network writes.
const main = document.querySelector('#main')
const fail = document.querySelector('#fail')
let medicine = null
let record = null
let draft = { name: '', strength: '', form: 'tablet', quantity: '1', time: '09:00' }
let logDraft = null
let saving = false
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
const amount = (quantity, form) => `${quantity} ${form}${Number(quantity) === 1 ? '' : 's'}`
const setScreen = (html) => {
  main.innerHTML = html
  main.focus()
  window.scrollTo(0, 0)
}
const heading = (title, text) => `<h1>${title}</h1><p class="muted">${text}</p>`
const back = (label = 'Back to Today') =>
  `<button class="back" type="button" data-action="today">${label}</button>`
const describe = () =>
  `${escapeHtml(medicine.name)}${medicine.strength ? ` · ${escapeHtml(medicine.strength)}` : ''}`
function today() {
  if (!medicine) {
    setScreen(
      `${heading('A little routine.<br>A little more ease.', 'Make space for your first medicine. We’ll take it one step at a time.')}<section class="empty"><h2>Your Today starts here</h2><p class="muted">No medicines added yet. Add one to see its scheduled dose here.</p></section><button class="primary" data-action="add">Add a medicine</button>`,
    )
    return
  }
  if (record) {
    history()
    return
  }
  setScreen(
    `${heading('Today', 'Tuesday, 3 November · Europe/Istanbul')}<section class="dose"><span class="status">Not logged</span><p>Scheduled today</p><div class="time">${medicine.time}</div><h2>${describe()}</h2><p>${amount(medicine.quantity, medicine.form)} · Every day</p><button class="primary" data-action="log">Log this dose</button></section><p class="hint">Not logged means no outcome has been recorded. Your next scheduled dose stays at ${medicine.time} tomorrow.</p><button class="secondary" data-action="edit">Edit medicine setup</button>`,
  )
}
function setup() {
  setScreen(`${back()}${heading('Add your medicine', 'Use the details from your own routine. This example doesn’t recommend a dose.')}<form id="setup" novalidate>
    <div class="field"><label for="name">Medicine name</label><input id="name" name="name" maxlength="100" autocomplete="off" placeholder="e.g. Vitamin D3" value="${escapeHtml(draft.name)}" aria-describedby="name-error" required><p id="name-error" class="error"></p></div>
    <div class="field"><label for="strength">Strength <span class="muted">(optional)</span></label><input id="strength" name="strength" maxlength="60" placeholder="e.g. 1000 IU" value="${escapeHtml(draft.strength)}" aria-describedby="strength-hint"><p class="hint" id="strength-hint">Strength is the label detail, not how many you take.</p></div>
    <div class="row"><div class="field"><label for="form">Medicine form</label><select id="form" name="form"><option value="tablet" ${draft.form === 'tablet' ? 'selected' : ''}>Tablet</option><option value="capsule" ${draft.form === 'capsule' ? 'selected' : ''}>Capsule</option></select></div><div class="field"><label for="quantity">Amount per dose</label><input id="quantity" name="quantity" type="number" inputmode="decimal" min="0.5" step="0.5" value="${escapeHtml(draft.quantity)}" aria-describedby="quantity-hint quantity-error"><p id="quantity-error" class="error"></p></div></div>
    <p class="hint" id="quantity-hint">Whole or half tablets; whole capsules.</p><div class="field" style="margin-top:24px"><label for="time">Daily scheduled time</label><input id="time" name="time" type="time" required value="${escapeHtml(draft.time)}" aria-describedby="time-hint time-error"><p class="hint" id="time-hint">Europe/Istanbul · Starts today, 3 November</p><p id="time-error" class="error"></p></div><p id="save-error" class="error" role="alert"></p><button class="primary" type="submit">Save medicine &amp; see Today</button><p class="hint">Prototype: daily schedule only. No reminders are sent.</p></form>`)
}
function logDose() {
  logDraft ??= { quantity: medicine.quantity, date: '2026-11-03', time: '09:12' }
  setScreen(
    `${back()}${heading('What did you take?', 'A real-life time is welcome. Logging later won’t move your schedule.')}<h2>${describe()}</h2><p class="muted">Scheduled: 3 Nov at ${medicine.time} · ${amount(medicine.quantity, medicine.form)}</p><form id="log" novalidate><div class="field"><label for="quantity">Amount taken (${medicine.form}s)</label><input id="quantity" name="quantity" type="number" min="0.5" step="0.5" inputmode="decimal" value="${escapeHtml(logDraft.quantity)}" aria-describedby="quantity-error"><p class="error" id="quantity-error"></p></div><div class="row"><div class="field"><label for="date">Actual intake date</label><input id="date" name="date" type="date" value="${logDraft.date}" max="2026-11-03" aria-describedby="date-error"><p class="error" id="date-error"></p></div><div class="field"><label for="time">Actual intake time</label><input id="time" name="time" type="time" value="${logDraft.time}" aria-describedby="time-error"><p class="error" id="time-error"></p></div></div><p class="hint">Demo clock: 3 Nov 2026, 10:00, Europe/Istanbul. Choose when you actually took it, up to this time.</p><p id="save-error" class="error" role="alert"></p><button class="primary" type="submit">Confirm taken</button></form>`,
  )
}
function history() {
  setScreen(
    `<div class="success" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4 10-10"/></svg></div>${heading('A little step, recorded.', 'Your reported intake is in this demo’s history.')}<span class="status">Taken · Recorded in demo</span><h2>${describe()}</h2><dl><div><dt>Scheduled</dt><dd>3 Nov · ${medicine.time}</dd></div><div><dt>Actual intake</dt><dd>${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(record.date + 'T12:00:00Z'))} · ${record.time}</dd></div><div><dt>Amount taken</dt><dd>${amount(record.quantity, medicine.form)}</dd></div></dl><p class="notice">Next dose: tomorrow at ${medicine.time}.<br>Your schedule hasn’t shifted.</p><button class="primary" data-action="correct">Correct this record</button><p class="hint">Demo only. Refresh clears this record.</p>`,
  )
}
function fieldError(id, message) {
  document.querySelector(`#${id}`).setAttribute('aria-invalid', 'true')
  document.querySelector(`#${id}-error`).textContent = message
}
async function save(form, apply) {
  saving = true
  const button = form.querySelector('[type=submit]')
  button.disabled = true
  button.textContent = 'Saving in demo…'
  await new Promise((resolve) => setTimeout(resolve, 450))
  saving = false
  if (fail.checked) {
    fail.checked = false
    const error = document.querySelector('#save-error')
    error.textContent = 'Couldn’t save in this demo. Your details are still here. Try again.'
    button.disabled = false
    button.textContent = 'Try saving again'
    error.setAttribute('tabindex', '-1')
    error.focus()
    return
  }
  apply()
}
main.addEventListener('input', (event) => {
  const form = event.target.closest('form')
  if (!form) return
  const values = Object.fromEntries(new FormData(form))
  if (form.id === 'setup') draft = values
  else logDraft = values
})
main.addEventListener('submit', (event) => {
  event.preventDefault()
  if (saving) return
  const form = event.target
  form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'))
  form.querySelectorAll('.error').forEach((error) => {
    error.textContent = ''
  })
  const data = Object.fromEntries(new FormData(form))
  const quantity = Number(data.quantity)
  const unit = form.id === 'setup' ? data.form : medicine.form
  if (
    !(quantity > 0) ||
    !Number.isFinite(quantity) ||
    quantity % (unit === 'tablet' ? 0.5 : 1) !== 0
  )
    fieldError(
      'quantity',
      unit === 'tablet'
        ? 'Enter whole or half tablets, such as 1 or 0.5.'
        : 'Enter a whole number of capsules, such as 1.',
    )
  if (!data.time || !/^\d{2}:\d{2}$/.test(data.time)) fieldError('time', 'Choose a valid time.')
  if (form.id === 'setup' && !data.name.trim())
    fieldError('name', 'Enter the medicine name from its label.')
  if (form.id === 'log') {
    if (!data.date || data.date > '2026-11-03')
      fieldError('date', 'Choose 3 November 2026 or an earlier intake date.')
    if (data.date === '2026-11-03' && data.time > '10:00')
      fieldError('time', 'Choose a time at or before the demo clock, 10:00.')
  }
  const invalid = form.querySelector('[aria-invalid=true]')
  if (invalid) {
    invalid.focus()
    return
  }
  if (form.id === 'setup')
    save(form, () => {
      medicine = { ...data, name: data.name.trim(), quantity }
      today()
    })
  else
    save(form, () => {
      record = { ...data, quantity }
      history()
    })
})
main.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action
  if (!action || saving) return
  if (action === 'today') today()
  if (action === 'add' || action === 'edit') setup()
  if (action === 'log' || action === 'correct') logDose()
})
document.querySelector('.brand').addEventListener('click', (event) => {
  event.preventDefault()
  if (!saving) today()
})
document.querySelector('#reset').addEventListener('click', () => {
  if (saving) return
  medicine = null
  record = null
  logDraft = null
  draft = { name: '', strength: '', form: 'tablet', quantity: '1', time: '09:00' }
  fail.checked = false
  today()
})
today()
