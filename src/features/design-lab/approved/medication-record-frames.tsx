import type { LabFrame } from '../frames'
import { MedicationRecordScreen } from './medication-record-screens'

/** #292 lifecycle frames retained for #302. Record editing shipped in #301. */
export const medicationRecordFrames = [
  {
    slug: '292-s5',
    citation: '292·S5',
    title: 'Archive confirmation',
    render: () => <MedicationRecordScreen state="archive" />,
  },
  {
    slug: '292-s8',
    citation: '292·S8',
    title: 'Restore confirmation',
    render: () => <MedicationRecordScreen state="restore" />,
  },
  {
    slug: '292-s9',
    citation: '292·S9',
    title: 'Restored - no schedule restarted',
    render: () => <MedicationRecordScreen state="restored" />,
  },
  {
    slug: '292-s10',
    citation: '292·S10',
    title: 'Delete never-used medication',
    render: () => <MedicationRecordScreen state="delete" />,
  },
  {
    slug: '292-s11',
    citation: '292·S11',
    title: 'Deleted - Medications',
    render: () => <MedicationRecordScreen state="deleted" />,
  },
] satisfies readonly LabFrame[]
