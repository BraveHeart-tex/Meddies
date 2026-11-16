import type { LabFrame } from '../frames'
import { AddMedicationScreen, SharedScreen } from './medication-types-screens'

/** #265: approved Direction B, Type first; B1-B3 are built (#336), shared frames cover amounts, schedules and wording. */
export const medicationTypesFrames = [
  {
    slug: '265-b4',
    citation: '265·B4',
    title: 'Type first - Inhaler',
    render: () => <AddMedicationScreen state="inhaler" />,
  },
  {
    slug: '265-b5',
    citation: '265·B5',
    title: 'Type first - Drops',
    render: () => <AddMedicationScreen state="drops" />,
  },
  {
    slug: '265-s2',
    citation: '265·S2',
    title: 'Interval setup - Inhaler amount',
    render: () => <SharedScreen state="interval-setup" />,
  },
  {
    slug: '265-s3',
    citation: '265·S3',
    title: 'Clock edit - Drops amounts',
    render: () => <SharedScreen state="clock-edit" />,
  },
  {
    slug: '265-s5',
    citation: '265·S5',
    title: 'Scheduled dose change - Inhaler',
    render: () => <SharedScreen state="taken-change" />,
  },
  {
    slug: '265-s6',
    citation: '265·S6',
    title: 'Unscheduled dose - Drops validation',
    render: () => <SharedScreen state="unscheduled" />,
  },
  {
    slug: '265-s8',
    citation: '265·S8',
    title: 'Today wording',
    render: () => <SharedScreen state="today" />,
  },
  {
    slug: '265-s9',
    citation: '265·S9',
    title: 'History wording',
    render: () => <SharedScreen state="history" />,
  },
] satisfies readonly LabFrame[]
