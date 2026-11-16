import { magnesium } from '../lab-fixtures'

/** #292's synthetic record: a 200 mg revision before today's change to 400 mg at 09:00. */
export const recordExample = {
  medicine: magnesium,
  today: '2026-11-09',
  now: '2026-11-09T07:00:00.000Z',
  previousStrength: '200 mg',
  currentStrength: '400 mg',
  latestTaken: '2026-11-09T05:05:00.000Z',
  changedAt: '2026-11-09T06:00:00.000Z',
} as const

export type RecordState =
  | 'detail'
  | 'fix'
  | 'strength'
  | 'revision'
  | 'unused'
  | 'invalid'
  | 'late'
  | 'restore'
  | 'restored'
  | 'saving'
  | 'offline'
  | 'failure'
  | 'uncertain'
  | 'conflict'
  | 'saved'
  | 'discard'
  | 'loading'
  | 'load-error'
  | 'history'
