import type { ReactNode } from 'react'
import type { DesignFrame } from './frames'
import { clockWithLunch } from './edit-lab-model'
import { TODAY } from './lab-fixtures'
import {
  clockEnded,
  clockToTuesday,
  intervalToTuesday,
  shortDay,
  TUESDAY,
  WEDNESDAY,
} from './last-day-model'
import { EndedListFrame, LastDayDetail, RestartedAlert, StoppedAlert } from './last-day-detail'
import { LastDayChange, LastDaySetup } from './last-day-screens'

const fromTuesday = { hours: '8', date: TUESDAY, time: '08:00', quantity: '1' }
const fromWednesday = { ...fromTuesday, date: WEDNESDAY }

const at = (n: number) => `/lab/227-a${n}`
const frame = (n: number, title: string, render: () => ReactNode): DesignFrame => ({
  slug: `227-a${n}` as DesignFrame['slug'],
  title,
  citation: `227·A${n}` as DesignFrame['citation'],
  render,
})

/**
 * #227, Direction A approved: the optional Last day as a field (set times) or row (every few
 * hours) in setup and Change schedule, Stop schedule beside Change schedule, and Ended schedules
 * on Medication detail and Medications (A), then Stop's save states (S).
 */
export const lastDayFrames: readonly DesignFrame[] = [
  frame(1, 'Set times, no last day', () => <LastDaySetup kind="times" />),
  frame(2, 'Set times, last day chosen', () => <LastDaySetup kind="times" lastDay={TUESDAY} />),
  frame(3, 'Set times, last day before start', () => (
    <LastDaySetup kind="times" start={WEDNESDAY} lastDay={TUESDAY} showErrors />
  )),
  frame(4, 'Every few hours, doses cut short', () => (
    <LastDaySetup kind="interval" interval={fromTuesday} lastDay={TUESDAY} />
  )),
  frame(5, 'Every few hours, last day before first date', () => (
    <LastDaySetup kind="interval" interval={fromWednesday} lastDay={TUESDAY} showErrors />
  )),
  frame(6, 'Last day sheet', () => (
    <LastDaySetup kind="interval" interval={fromTuesday} lastDay={TUESDAY} sheet />
  )),
  frame(7, 'Change, set times, last day prefilled', () => (
    <LastDayChange current={clockToTuesday} back={at(13)} />
  )),
  frame(8, 'Change, set times, last day moved to today', () => (
    <LastDayChange current={clockToTuesday} lastDay={TODAY} back={at(13)} />
  )),
  frame(9, 'Change, set times, last day removed', () => (
    <LastDayChange current={clockToTuesday} lastDay={null} back={at(13)} />
  )),
  frame(10, 'Change, every few hours, last day prefilled', () => (
    <LastDayChange current={intervalToTuesday} back={at(14)} />
  )),
  frame(11, 'Change, every few hours, last day moved to today', () => (
    <LastDayChange current={intervalToTuesday} lastDay={TODAY} back={at(14)} />
  )),
  frame(12, 'Change, every few hours, last day removed', () => (
    <LastDayChange current={intervalToTuesday} lastDay={null} back={at(14)} />
  )),
  frame(13, 'Detail, set times with a last day', () => (
    <LastDayDetail schedule={clockToTuesday} change={at(7)} stop={at(15)} />
  )),
  frame(14, 'Detail, every few hours with a last day', () => (
    <LastDayDetail schedule={intervalToTuesday} change={at(10)} stop={at(15)} />
  )),
  frame(15, 'Stop schedule, confirm step', () => (
    <LastDayDetail schedule={clockToTuesday} change={at(7)} stop={at(15)} stopState="idle" />
  )),
  frame(16, 'Stopped, Ended today', () => (
    <LastDayDetail
      schedule={clockToTuesday}
      endedOn={TODAY}
      change={at(18)}
      alert={<StoppedAlert />}
    />
  )),
  frame(17, 'Detail, Ended schedule', () => (
    <LastDayDetail schedule={clockEnded} endedOn={clockEnded.lastDay!} change={at(18)} />
  )),
  frame(18, 'Change an Ended schedule, last day passed', () => (
    <LastDayChange current={clockEnded} clock={clockWithLunch} showErrors back={at(17)} />
  )),
  frame(19, 'Restarted, last day removed', () => (
    <LastDayDetail
      schedule={{ ...clockEnded, lastDay: null }}
      change={at(7)}
      stop={at(15)}
      alert={<RestartedAlert />}
      changed
    />
  )),
  frame(20, 'Medications, Ended group', () => <EndedListFrame />),
  {
    slug: '227-s1',
    title: 'Stopping',
    citation: '227·S1',
    render: () => <LastDayDetail schedule={clockToTuesday} change={at(7)} stopState="stopping" />,
  },
  {
    slug: '227-s2',
    title: 'Stop might not have saved',
    citation: '227·S2',
    render: () => <LastDayDetail schedule={clockToTuesday} change={at(7)} stopState="unknown" />,
  },
]
