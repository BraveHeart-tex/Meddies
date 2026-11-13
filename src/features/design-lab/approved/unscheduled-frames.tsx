import type { ReactNode } from 'react'
import type { LabFrame } from '../frames'
import { ibuprofen, magnesium, TODAY } from '../lab-fixtures'
import { ChangeDrawer, LogDrawer } from './unscheduled-drawers'
import {
  at,
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

/** 22:30 yesterday, ½ tablet: Other with halves. */
const lateYesterday: DoseValues = { when: 'other', date: YESTERDAY, time: '22:30', quantity: '½' }
/** 10:30 today is after Now, and 0 is no dose. */
const invalid: DoseValues = { when: 'other', date: TODAY, time: '10:30', quantity: '0' }

const logDetail = (medicine = ibuprofen, children?: ReactNode) => (
  <LogDetail
    medicine={medicine}
    logHref={medicine.id === magnesium.id ? '/lab/241-a4' : '/lab/241-a3'}
  >
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
      back={medicine.id === magnesium.id ? '/lab/241-a2' : '/lab/241-a1'}
      {...options}
    />,
  )

const today = (children?: ReactNode, unscheduledDoses = todayUnscheduled) => (
  <TodayScreen scheduled={todayScheduled} unscheduled={unscheduledDoses} changeHref={'/lab/241-a8'}>
    {children}
  </TodayScreen>
)

const change = (confirm: boolean, step?: SaveStep) =>
  today(
    <ChangeDrawer
      dose={morningIbuprofen}
      confirm={confirm}
      step={step}
      back={'/lab/241-a5'}
      removeHref={'/lab/241-a9'}
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
export const unscheduledFrames = [
  {
    slug: '241-a1',
    title: 'Detail, no schedule',
    citation: '241·A1',
    render: () => logDetail(),
  },
  {
    slug: '241-a2',
    title: 'Detail, set times',
    citation: '241·A2',
    render: () => logDetail(magnesium),
  },
  {
    slug: '241-a3',
    title: 'Log a dose, Now',
    citation: '241·A3',
    render: () => logDrawer(ibuprofen, nowValues),
  },
  {
    slug: '241-a4',
    title: 'Log a dose, another time yesterday',
    citation: '241·A4',
    render: () => logDrawer(magnesium, lateYesterday),
  },
  {
    slug: '241-a5',
    title: 'Today, beside scheduled doses',
    citation: '241·A5',
    render: () => today(),
  },
  {
    slug: '241-a6',
    title: 'Today, only Unscheduled doses',
    citation: '241·A6',
    render: () => (
      <TodayScreen scheduled={[]} unscheduled={onlyUnscheduled} changeHref={'/lab/241-a8'} />
    ),
  },
  {
    slug: '241-a7',
    title: 'History, Sun 8 Nov',
    citation: '241·A7',
    render: () => (
      <HistoryScreen
        date={YESTERDAY}
        scheduled={yesterdayScheduled}
        unscheduled={yesterdayUnscheduled}
        changeHref={'/lab/241-a8'}
      />
    ),
  },
  {
    slug: '241-a8',
    title: 'Tapped on Today, change or remove',
    citation: '241·A8',
    render: () => change(false),
  },
  {
    slug: '241-a9',
    title: 'Remove, confirm step',
    citation: '241·A9',
    render: () => change(true),
  },
  {
    slug: '241-s1',
    title: 'Log a dose, field errors',
    citation: '241·S1',
    render: () => logDrawer(ibuprofen, invalid, { validated: true }),
  },
  {
    slug: '241-s2',
    title: 'Saved, today',
    citation: '241·S2',
    render: () =>
      logDetail(
        ibuprofen,
        <LabToast
          title={savedMessage(ibuprofen, unscheduled(6, ibuprofen, at(TODAY, '10:00')), TODAY)}
        />,
      ),
  },
  {
    slug: '241-s3',
    title: 'Saved after midnight, names the day',
    citation: '241·S3',
    render: () =>
      logDetail(magnesium, <LabToast title={savedMessage(magnesium, lateMagnesium, TODAY)} />),
  },
  {
    slug: '241-s4',
    title: 'Saving',
    citation: '241·S4',
    render: () => logDrawer(ibuprofen, nowValues, { step: 'saving' }),
  },
  {
    slug: '241-s5',
    title: 'Might not have saved',
    citation: '241·S5',
    render: () => logDrawer(ibuprofen, nowValues, { step: 'unknown' }),
  },
  {
    slug: '241-s6',
    title: 'Not saved, time in the future',
    citation: '241·S6',
    render: () => logDrawer(ibuprofen, nowValues, { step: 'rejected' }),
  },
  {
    slug: '241-s7',
    title: 'Changed',
    citation: '241·S7',
    render: () =>
      today(
        <LabToast
          title={savedMessage(ibuprofen, changedIbuprofen, TODAY, 'changed to taken at')}
        />,
        [changedIbuprofen],
      ),
  },
  {
    slug: '241-s8',
    title: 'Removing',
    citation: '241·S8',
    render: () => change(true, 'saving'),
  },
  {
    slug: '241-s9',
    title: 'Remove might not have saved',
    citation: '241·S9',
    render: () => change(true, 'unknown'),
  },
  {
    slug: '241-s10',
    title: 'Removed',
    citation: '241·S10',
    render: () =>
      today(<LabToast title={removedMessage(ibuprofen, morningIbuprofen)} type={null} />, []),
  },
] satisfies readonly LabFrame[]
