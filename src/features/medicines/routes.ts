/** A medication's record subview: Detail correction, Change strength, Strength or Dose history. */
export type MedicationRecord = 'fix' | 'strength' | 'history' | 'doses'
const records: readonly unknown[] = [
  'fix',
  'strength',
  'history',
  'doses',
] satisfies MedicationRecord[]

/** One `/medications` URL state. Every view shares the one mounted Medications panel. */
export type MedicationsView =
  | { mode: 'list' }
  | { mode: 'add' }
  | { mode: 'archived' }
  | {
      mode: 'detail'
      medicineId: string
      record?: MedicationRecord
      periodId?: string
      /** The Manage sub-screen (403·B14); a record subview wins over it. */
      manage?: true
    }
  | { mode: 'setup'; medicineId: string }
  | { mode: 'resume'; medicineId: string }

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

/**
 * Reads the view from server `searchParams` or the browser URL: setup, resume, detail, Archived
 * medications, Add, then list.
 */
export function parseMedicationsView(params: SearchParams): MedicationsView {
  const setup = medicineId(params, 'schedule')
  if (setup) return { mode: 'setup', medicineId: setup }
  const resume = medicineId(params, 'resume')
  if (resume) return { mode: 'resume', medicineId: resume }
  const detail = medicineId(params, 'medicine')
  if (detail) {
    const record = params instanceof URLSearchParams ? params.get('record') : params.record
    const periodId = medicineId(params, 'period')
    if (records.includes(record))
      return {
        mode: 'detail',
        medicineId: detail,
        record: record as MedicationRecord,
        ...(periodId ? { periodId } : {}),
      }
    return {
      mode: 'detail',
      medicineId: detail,
      ...(periodId ? { periodId } : {}),
      ...(includes(params, 'manage') ? { manage: true as const } : {}),
    }
  }
  if (includes(params, 'archived')) return { mode: 'archived' }
  return includes(params, 'add') ? { mode: 'add' } : { mode: 'list' }
}

export function medicationsHref(view: MedicationsView) {
  switch (view.mode) {
    case 'list':
      return '/medications'
    case 'add':
      return '/medications?add'
    case 'archived':
      return '/medications?archived'
    case 'detail':
      return `/medications?medicine=${encodeURIComponent(view.medicineId)}${view.record ? `&record=${view.record}` : ''}${view.periodId ? `&period=${encodeURIComponent(view.periodId)}` : ''}${view.manage ? '&manage' : ''}`
    case 'setup':
      return `/medications?schedule=${encodeURIComponent(view.medicineId)}`
    case 'resume':
      return `/medications?resume=${encodeURIComponent(view.medicineId)}`
  }
}

/** Schedule setup for a medicine, opened at its heading. */
export const medicationSetupHref = (medicineId: string) =>
  `${medicationsHref({ mode: 'setup', medicineId })}#schedule-heading`

/** An Interval schedule's Resume schedule screen (233·A9), opened at its heading. */
export const medicationResumeHref = (medicineId: string) =>
  `${medicationsHref({ mode: 'resume', medicineId })}#schedule-heading`

/** The Archived medications view. */
export const archivedMedicationsHref = medicationsHref({ mode: 'archived' })

/** Whether `value` is exactly the href of a Medications view, as sign-in may return to one. */
export function isMedicationsReturnTo(value: string) {
  if (!value.startsWith('/medications')) return false
  const { searchParams } = new URL(value, 'http://return-to.invalid')
  return value === medicationsHref(parseMedicationsView(searchParams))
}

/** A medication's Manage sub-screen (403·B14). */
export const medicationManageHref = (medicineId: string) =>
  medicationsHref({ mode: 'detail', medicineId, manage: true })

/** Medication record subviews share the medication's URL and session cache. */
export const medicationRecordHref = (
  medicineId: string,
  record?: MedicationRecord,
  periodId?: string,
) => medicationsHref({ mode: 'detail', medicineId, record, periodId })
