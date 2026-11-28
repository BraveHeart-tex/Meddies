import type { QueryClient } from '@tanstack/react-query'
import type { DailySchedule } from '../../src/features/schedules/contract'
import type { IntervalFormValues } from '../../src/features/schedules/interval-form-schema'
import type { ScheduleFormValues } from '../../src/features/schedules/schedule-form-schema'
import {
  intervalDraftKey,
  scheduleDraftBase,
  scheduleKindOf,
  writeScheduleKind,
} from '../../src/features/schedules/schedule-setup-drafts'
import { writeSessionDraft } from '../../src/lib/session-drafts'

/** Seed raw form values before render when filling the form is only a precondition. */
export function seedScheduleDraft(
  client: QueryClient,
  medicineId: string,
  draft:
    | { kind: 'times'; values: ScheduleFormValues }
    | { kind: 'interval'; values: IntervalFormValues },
  current?: DailySchedule,
) {
  const base = scheduleDraftBase(medicineId, current)
  writeScheduleKind(client, base, draft.kind, scheduleKindOf(current))
  writeSessionDraft(client, draft.kind === 'interval' ? intervalDraftKey(base) : base, draft.values)
}
