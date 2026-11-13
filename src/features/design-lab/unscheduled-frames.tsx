import type { ReactNode } from 'react'
import type { DesignFrame } from './frames'
import { magnesium, TODAY } from './lab-fixtures'
import { ChangeDrawer, LogDrawer } from './unscheduled-drawers'
import {
  at,
  ibuprofen,
  morningIbuprofen,
  nowValues,
  onlyUnscheduled,
  removedMessage,
  savedMessage,
  todayScheduled,
  todayUnscheduled,
  unscheduled,
  YESTERDAY,
  yesterdayScheduled,
  yesterdayUnscheduled,
  type DoseValues,
} from './unscheduled-model'
import { LabToast, type SaveStep } from './unscheduled-parts'
import { HistoryScreen, LogDetail, TodayScreen } from './unscheduled-screens'

const NOW_MINUTE = '2026-11-09T10:00'
const href = (id: string) => `/lab/241-${id.toLowerCase()}`

const frame = (id: string, title: string, render: () => ReactNode): DesignFrame => ({
  slug: `241-${id.toLowerCase()}` as DesignFrame['slug'],
  title,
  citation: `241·${id}` as DesignFrame['citation'],
  render,
})

/** 22:30 yesterday, ½ tablet: Other with halves. */
const lateYesterday: DoseValues = { when: 'other', date: YESTERDAY, time: '22:30', quantity: '½' }
/** 10:30 today is after Now, and 0 is no dose. */
const invalid: DoseValues = { when: 'other', date: TODAY, time: '10:30', quantity: '0' }

const logDetail = (medicine = ibuprofen, children?: ReactNode) => (
  <LogDetail medicine={medicine} logHref={href(medicine.id === magnesium.id ? 'A4' : 'A3')}>
    {children}
  </LogDetail>
)

const logDrawer = (
  medicine: typeof ibuprofen,
  initial: DoseValues,
  options: { validated?: boolean; step?: SaveStep } = {},
) =>
  logDetail(
    medicine,
    <LogDrawer
      medicine={medicine}
      now={NOW_MINUTE}
      initial={initial}
      back={href(medicine.id === magnesium.id ? 'A2' : 'A1')}
      {...options}
    />,
  )

const today = (children?: ReactNode, unscheduledDoses = todayUnscheduled) => (
  <TodayScreen scheduled={todayScheduled} unscheduled={unscheduledDoses} changeHref={href('A8')}>
    {children}
  </TodayScreen>
)

const change = (confirm: boolean, step?: SaveStep) =>
  today(
    <ChangeDrawer
      dose={morningIbuprofen}
      confirm={confirm}
      step={step}
      back={href('A5')}
      removeHref={href('A9')}
    />,
  )

const lateMagnesium = unscheduled(5, magnesium, at(YESTERDAY, '23:30'), 0.5)
const changedIbuprofen = { ...morningIbuprofen, takenAt: at(TODAY, '09:15') }

/**
 * #241, Direction A approved: Log a dose as an outline button under the schedule, the Taken drawer
 * with "Not on a schedule" in its muted line, rows marked in their detail line and in time order,
 * and a change drawer that opens on the fields with Remove dose and its confirm step (A); then
 * the errors, save states and save messages (S).
 */
export const unscheduledFrames: readonly DesignFrame[] = [
  frame('A1', 'Detail, no schedule', () => logDetail()),
  frame('A2', 'Detail, set times', () => logDetail(magnesium)),
  frame('A3', 'Log a dose, Now', () => logDrawer(ibuprofen, nowValues)),
  frame('A4', 'Log a dose, another time yesterday', () => logDrawer(magnesium, lateYesterday)),
  frame('A5', 'Today, beside scheduled doses', () => today()),
  frame('A6', 'Today, only Unscheduled doses', () => (
    <TodayScreen scheduled={[]} unscheduled={onlyUnscheduled} changeHref={href('A8')} />
  )),
  frame('A7', 'History, Sun 8 Nov', () => (
    <HistoryScreen
      date={YESTERDAY}
      scheduled={yesterdayScheduled}
      unscheduled={yesterdayUnscheduled}
      changeHref={href('A8')}
    />
  )),
  frame('A8', 'Tapped on Today, change or remove', () => change(false)),
  frame('A9', 'Remove, confirm step', () => change(true)),
  frame('S1', 'Log a dose, field errors', () => logDrawer(ibuprofen, invalid, { validated: true })),
  frame('S2', 'Saved, today', () =>
    logDetail(
      ibuprofen,
      <LabToast
        title={savedMessage(ibuprofen, unscheduled(6, ibuprofen, at(TODAY, '10:00')), TODAY)}
      />,
    ),
  ),
  frame('S3', 'Saved after midnight, names the day', () =>
    logDetail(magnesium, <LabToast title={savedMessage(magnesium, lateMagnesium, TODAY)} />),
  ),
  frame('S4', 'Saving', () => logDrawer(ibuprofen, nowValues, { step: 'saving' })),
  frame('S5', 'Might not have saved', () => logDrawer(ibuprofen, nowValues, { step: 'unknown' })),
  frame('S6', 'Not saved, time in the future', () =>
    logDrawer(ibuprofen, nowValues, { step: 'rejected' }),
  ),
  frame('S7', 'Changed', () =>
    today(
      <LabToast title={savedMessage(ibuprofen, changedIbuprofen, TODAY, 'changed to taken at')} />,
      [changedIbuprofen],
    ),
  ),
  frame('S8', 'Removing', () => change(true, 'saving')),
  frame('S9', 'Remove might not have saved', () => change(true, 'unknown')),
  frame('S10', 'Removed', () =>
    today(<LabToast title={removedMessage(ibuprofen, morningIbuprofen)} type={null} />, []),
  ),
]
