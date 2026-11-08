/** One `/medications` URL state. Every view shares the one mounted Medications panel. */
export type MedicationsView =
  | { mode: 'list' }
  | { mode: 'add' }
  | { mode: 'detail'; medicineId: string }
  | { mode: 'setup'; medicineId: string }

type SearchParams = URLSearchParams | Record<string, string | string[] | undefined>

const medicineIdPattern = /^[a-f0-9-]{36}$/i

function includes(params: SearchParams, name: string) {
  return params instanceof URLSearchParams ? params.has(name) : params[name] !== undefined
}

/** The medicine id in `name`, unless it is missing, malformed or repeated. */
function medicineId(params: SearchParams, name: string) {
  const values = params instanceof URLSearchParams ? params.getAll(name) : [params[name]].flat()
  const [value] = values
  return values.length === 1 && value && medicineIdPattern.test(value) ? value : ''
}

/** Reads the view from server `searchParams` or the browser URL: setup, detail, Add, then list. */
export function parseMedicationsView(params: SearchParams): MedicationsView {
  const setup = medicineId(params, 'schedule')
  if (setup) return { mode: 'setup', medicineId: setup }
  const detail = medicineId(params, 'medicine')
  if (detail) return { mode: 'detail', medicineId: detail }
  return includes(params, 'add') ? { mode: 'add' } : { mode: 'list' }
}

export function medicationsHref(view: MedicationsView) {
  switch (view.mode) {
    case 'list':
      return '/medications'
    case 'add':
      return '/medications?add'
    case 'detail':
      return `/medications?medicine=${encodeURIComponent(view.medicineId)}`
    case 'setup':
      return `/medications?schedule=${encodeURIComponent(view.medicineId)}`
  }
}

/** Schedule setup for a medicine, opened at its heading. */
export const medicationSetupHref = (medicineId: string) =>
  `${medicationsHref({ mode: 'setup', medicineId })}#schedule-heading`

/** Whether `value` is exactly the href of a Medications view, as sign-in may return to one. */
export function isMedicationsReturnTo(value: string) {
  if (!value.startsWith('/medications')) return false
  const { searchParams } = new URL(value, 'http://return-to.invalid')
  return value === medicationsHref(parseMedicationsView(searchParams))
}
