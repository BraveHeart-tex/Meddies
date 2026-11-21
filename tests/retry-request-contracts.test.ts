import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  parseDetailCorrection,
  parseStrengthChange,
  parseMedicineArchive,
  parseMedicineRestore,
  parseMedicineDelete,
  parseStockOn,
  parseStockOff,
  parseStockCorrection,
  parseStockRefill,
} from '../src/features/medicines/contract'
import {
  parseScheduleEdit,
  parseScheduleStop,
  parseSchedulePause,
  parseScheduleResume,
} from '../src/features/schedules/contract'
import {
  parseUnscheduledDose,
  parseUnscheduledDoseChange,
} from '../src/features/unscheduled-doses/contract'
import fixtures from './fixtures/retry-requests.json'

// Match the stored request envelopes in worker/medicines.ts, worker/schedules.ts and
// worker/doses/unscheduled.ts. Creation and scheduled Dose outcomes compare fields,
// not whole request text. Changing these literals needs an explicit compatibility
// decision: deployed receipts must still recognize retries parsed by a newer Worker.
const requests: Record<string, (input: unknown) => object> = {
  correctDetails: (input) => ({ kind: 'correctDetails', ...parseDetailCorrection(input) }),
  changeStrength: (input) => ({ kind: 'changeStrength', ...parseStrengthChange(input) }),
  archive: parseMedicineArchive,
  restore: parseMedicineRestore,
  delete: parseMedicineDelete,
  stockOn: (input) => ({ kind: 'stockOn', ...parseStockOn(input) }),
  stockOff: (input) => ({ kind: 'stockOff', ...parseStockOff(input) }),
  stockCorrection: (input) => ({ kind: 'stockCorrection', ...parseStockCorrection(input) }),
  stockRefill: (input) => ({ kind: 'stockRefill', ...parseStockRefill(input) }),
  edit: parseScheduleEdit,
  stop: parseScheduleStop,
  pause: (input) => ({ ...parseSchedulePause(input), operation: 'pause' }),
  resume: (input) => ({ ...parseScheduleResume(input), operation: 'resume' }),
  saveUnscheduled: parseUnscheduledDose,
  changeUnscheduled: parseUnscheduledDoseChange,
}

test('parser changes preserve stored retry request text for every text-compared operation', () => {
  for (const fixture of fixtures) {
    assert.equal(
      JSON.stringify(requests[fixture.parser](fixture.input)),
      fixture.storedText,
      fixture.name,
    )
  }
})
