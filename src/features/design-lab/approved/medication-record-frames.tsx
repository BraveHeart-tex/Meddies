import type { LabFrame } from '../frames'
import { MedicationRecordScreen } from './medication-record-screens'

/** #292: approved Direction A; shared frames cover record safety and recovery. */
export const medicationRecordFrames = [
  {
    slug: '292-a1',
    citation: '292·A1',
    title: 'Separate actions - medication page',
    render: () => <MedicationRecordScreen state="detail" />,
  },
  {
    slug: '292-a2',
    citation: '292·A2',
    title: 'Separate actions - fix a mistake',
    render: () => <MedicationRecordScreen state="fix" />,
  },
  {
    slug: '292-a3',
    citation: '292·A3',
    title: 'Separate actions - change strength',
    render: () => <MedicationRecordScreen state="strength" />,
  },
  {
    slug: '292-s1',
    citation: '292·S1',
    title: 'Earlier strength correction',
    render: () => <MedicationRecordScreen state="revision" />,
  },
  {
    slug: '292-s2',
    citation: '292·S2',
    title: 'Never-used medication - editable Type',
    render: () => <MedicationRecordScreen state="unused" />,
  },
  {
    slug: '292-s3',
    citation: '292·S3',
    title: 'Strength change - date validation',
    render: () => <MedicationRecordScreen state="invalid" />,
  },
  {
    slug: '292-s4',
    citation: '292·S4',
    title: 'Late Taken - strength to save',
    render: () => <MedicationRecordScreen state="late" />,
  },
  {
    slug: '292-s5',
    citation: '292·S5',
    title: 'Archive confirmation',
    render: () => <MedicationRecordScreen state="archive" />,
  },
  {
    slug: '292-s6',
    citation: '292·S6',
    title: 'Archived medications',
    render: () => <MedicationRecordScreen state="archived-list" />,
  },
  {
    slug: '292-s7',
    citation: '292·S7',
    title: 'Archived medication',
    render: () => <MedicationRecordScreen state="archived" />,
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
  {
    slug: '292-s12',
    citation: '292·S12',
    title: 'Saving strength change',
    render: () => <MedicationRecordScreen state="saving" />,
  },
  {
    slug: '292-s13',
    citation: '292·S13',
    title: 'Offline - details kept',
    render: () => <MedicationRecordScreen state="offline" />,
  },
  {
    slug: '292-s14',
    citation: '292·S14',
    title: 'Save rejected - details kept',
    render: () => <MedicationRecordScreen state="failure" />,
  },
  {
    slug: '292-s15',
    citation: '292·S15',
    title: 'Save result unknown - retry same attempt',
    render: () => <MedicationRecordScreen state="uncertain" />,
  },
  {
    slug: '292-s16',
    citation: '292·S16',
    title: 'Conflict - review saved details',
    render: () => <MedicationRecordScreen state="conflict" />,
  },
  {
    slug: '292-s17',
    citation: '292·S17',
    title: 'Saved strength change',
    render: () => <MedicationRecordScreen state="saved" />,
  },
  {
    slug: '292-s18',
    citation: '292·S18',
    title: 'Discard unsaved changes',
    render: () => <MedicationRecordScreen state="discard" />,
  },
  {
    slug: '292-s19',
    citation: '292·S19',
    title: 'No archived medications',
    render: () => <MedicationRecordScreen state="empty" />,
  },
  {
    slug: '292-s20',
    citation: '292·S20',
    title: 'Medication loading',
    render: () => <MedicationRecordScreen state="loading" />,
  },
  {
    slug: '292-s21',
    citation: '292·S21',
    title: 'Medication read error',
    render: () => <MedicationRecordScreen state="load-error" />,
  },
  {
    slug: '292-s22',
    citation: '292·S22',
    title: 'Strength history and correction entry',
    render: () => <MedicationRecordScreen state="history" />,
  },
] satisfies readonly LabFrame[]
