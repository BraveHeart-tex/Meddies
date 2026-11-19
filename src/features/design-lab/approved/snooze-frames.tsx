import type { LabFrame } from '../frames'
import { SnoozeScreen } from './snooze-parts'

/** #382 Snooze from the dose drawer: approved Direction C, Snooze beside Cancel. */
export const snoozeFrames = [
  {
    slug: '382-c1',
    citation: '382·C1',
    title: 'Snooze beside Cancel - Available',
    render: () => <SnoozeScreen state="available" />,
  },
  {
    slug: '382-c2',
    citation: '382·C2',
    title: 'Snooze beside Cancel - Reminder time',
    render: () => <SnoozeScreen state="snoozed" />,
  },
  {
    slug: '382-c3',
    citation: '382·C3',
    title: 'Snooze beside Cancel - Quiet hours',
    render: () => <SnoozeScreen state="quiet" />,
  },
  {
    slug: '382-c4',
    citation: '382·C4',
    title: 'Snooze beside Cancel - Not saved',
    render: () => <SnoozeScreen state="rejected" />,
  },
] satisfies readonly LabFrame[]
