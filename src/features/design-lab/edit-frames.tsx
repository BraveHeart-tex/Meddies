import type { DesignFrame } from './frames'
import { ChangeEntryFrame, FullScreenEdit, SavedFrame } from './schedule-edit-screens'
import {
  clockSchedule,
  clockWithLunch,
  intervalEverySix,
  intervalFromNoon,
  intervalSchedule,
} from './edit-lab-model'

/**
 * #215, Direction A approved: Change schedule reopens the setup screen on the current Schedule
 * version, with the next 3 doses after now and Save changes pinned to the bottom (A), then the
 * save states (S).
 */
export const editFrames: readonly DesignFrame[] = [
  {
    slug: '215-a1',
    title: 'Detail, Change schedule',
    citation: '215·A1',
    render: () => <ChangeEntryFrame schedule={clockSchedule} next="/lab/215-a2" />,
  },
  {
    slug: '215-a2',
    title: 'Set times, unchanged',
    citation: '215·A2',
    render: () => <FullScreenEdit current={clockSchedule} back="/lab/215-a1" />,
  },
  {
    slug: '215-a3',
    title: 'Set times, 14:00 added',
    citation: '215·A3',
    render: () => (
      <FullScreenEdit
        current={clockSchedule}
        initial={{ clock: clockWithLunch }}

        back="/lab/215-a1"
      />
    ),
  },
  {
    slug: '215-a4',
    title: 'Every few hours, unchanged',
    citation: '215·A4',
    render: () => <FullScreenEdit current={intervalSchedule} back="/lab/215-a1" />,
  },
  {
    slug: '215-a5',
    title: 'Every 8 hours to every 6',
    citation: '215·A5',
    render: () => (
      <FullScreenEdit
        current={intervalSchedule}
        initial={{ interval: intervalEverySix }}

        back="/lab/215-a1"
      />
    ),
  },
  {
    slug: '215-a6',
    title: 'Switch to every few hours',
    citation: '215·A6',
    render: () => (
      <FullScreenEdit
        current={clockSchedule}
        initial={{ kind: 'interval' }}

        back="/lab/215-a1"
      />
    ),
  },
  {
    slug: '215-a7',
    title: 'Switch, new Anchor chosen',
    citation: '215·A7',
    render: () => (
      <FullScreenEdit
        current={clockSchedule}
        initial={{ kind: 'interval', interval: intervalFromNoon }}

        back="/lab/215-a1"
      />
    ),
  },
  {
    slug: '215-a8',
    title: 'Switch, Save without an Anchor',
    citation: '215·A8',
    render: () => (
      <FullScreenEdit
        current={clockSchedule}
        initial={{ kind: 'interval', interval: { ...intervalFromNoon, time: '' } }}

        back="/lab/215-a1"
        startsError="Choose a time."
      />
    ),
  },
  {
    slug: '215-a9',
    title: 'Switch to set times',
    citation: '215·A9',
    render: () => (
      <FullScreenEdit
        current={intervalSchedule}
        initial={{ kind: 'times' }}

        back="/lab/215-a1"
      />
    ),
  },
  {
    slug: '215-s1',
    title: 'Saving',
    citation: '215·S1',
    render: () => (
      <FullScreenEdit
        current={clockSchedule}
        initial={{ clock: clockWithLunch }}

        state="saving"
        back="/lab/215-a1"
      />
    ),
  },
  {
    slug: '215-s2',
    title: 'Changed in another tab',
    citation: '215·S2',
    render: () => (
      <FullScreenEdit
        current={clockSchedule}
        initial={{ clock: clockWithLunch }}

        state="conflict"
        back="/lab/215-a1"
      />
    ),
  },
  {
    slug: '215-s3',
    title: 'Saved',
    citation: '215·S3',
    render: () => (
      <SavedFrame
        schedule={{ kind: 'times', clock: clockWithLunch }}
        first="today at 14:00"
        next="/lab/215-a2"
      />
    ),
  },
  {
    slug: '215-s4',
    title: 'Saved, every 6 hours',
    citation: '215·S4',
    render: () => (
      <SavedFrame
        schedule={{ kind: 'interval', interval: intervalEverySix }}
        first="today at 14:00"
        next="/lab/215-a4"
      />
    ),
  },
]
