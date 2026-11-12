import type { DesignFrame } from './frames'
import { IntervalDetailFrame, IntervalListFrame } from './interval-schedule-frame'
import { IntervalSetupFrame } from './interval-setup-frame'

const EARLIER_TODAY = { hours: '8', time: '08:00' }

/** #212: the approved setup frames for an Interval schedule (C), then its display (M, D). */
export const intervalFrames: readonly DesignFrame[] = [
  {
    slug: '212-c0',
    title: 'opens on set times',
    citation: '212·C0',
    render: () => <IntervalSetupFrame kind="times" />,
  },
  {
    slug: '212-c1',
    title: 'every few hours',
    citation: '212·C1',
    render: () => <IntervalSetupFrame />,
  },
  {
    slug: '212-c2',
    title: 'filled in',
    citation: '212·C2',
    render: () => <IntervalSetupFrame values={EARLIER_TODAY} />,
  },
  {
    slug: '212-c3',
    title: 'every sheet',
    citation: '212·C3',
    render: () => <IntervalSetupFrame values={{ hours: '8' }} sheet="every" />,
  },
  {
    slug: '212-c4',
    title: 'starts sheet',
    citation: '212·C4',
    render: () => <IntervalSetupFrame values={{ hours: '8', time: '08:00' }} sheet="starts" />,
  },
  {
    slug: '212-c5',
    title: 'take sheet',
    citation: '212·C5',
    render: () => <IntervalSetupFrame values={EARLIER_TODAY} sheet="take" />,
  },
  {
    slug: '212-c6',
    title: 'error',
    citation: '212·C6',
    render: () => (
      <IntervalSetupFrame errors={{ hours: 'Choose how many hours.', time: 'Choose a time.' }} />
    ),
  },
  {
    slug: '212-c7',
    title: 'discard check',
    citation: '212·C7',
    render: () => <IntervalSetupFrame values={EARLIER_TODAY} discard />,
  },
  {
    slug: '212-c8',
    title: 'every 7 hours',
    citation: '212·C8',
    render: () => <IntervalSetupFrame values={{ hours: '7', time: '20:00' }} />,
  },
  {
    slug: '212-c9',
    title: 'custom hours',
    citation: '212·C9',
    render: () => <IntervalSetupFrame values={{ hours: '5' }} sheet="every" />,
  },
  {
    slug: '212-c10',
    title: 'hours not whole',
    citation: '212·C10',
    render: () => (
      <IntervalSetupFrame
        values={{ hours: '1.5' }}
        errors={{ hours: 'Use whole hours, like 8.' }}
        sheet="every"
      />
    ),
  },
  {
    slug: '212-c11',
    title: 'hours out of range',
    citation: '212·C11',
    render: () => (
      <IntervalSetupFrame
        values={{ hours: '25' }}
        errors={{ hours: 'Use 1 to 24 hours.' }}
        sheet="every"
      />
    ),
  },
  {
    slug: '212-c12',
    title: 'first date blank',
    citation: '212·C12',
    render: () => (
      <IntervalSetupFrame
        values={{ hours: '8', date: '', time: '08:00' }}
        errors={{ date: 'Choose a date.' }}
        sheet="starts"
      />
    ),
  },
  {
    slug: '212-c13',
    title: 'first date earlier than today',
    citation: '212·C13',
    render: () => (
      <IntervalSetupFrame
        values={{ hours: '8', date: '2026-11-08', time: '08:00' }}
        errors={{ date: 'Choose today or a later date.' }}
        sheet="starts"
      />
    ),
  },
  {
    slug: '212-c14',
    title: 'first time blank',
    citation: '212·C14',
    render: () => (
      <IntervalSetupFrame
        values={{ hours: '8' }}
        errors={{ time: 'Choose a time.' }}
        sheet="starts"
      />
    ),
  },
  {
    slug: '212-c15',
    title: 'preview, future first time',
    citation: '212·C15',
    render: () => <IntervalSetupFrame values={{ hours: '4', time: '12:00' }} />,
  },
  {
    slug: '212-c16',
    title: 'preview, crossing midnight',
    citation: '212·C16',
    render: () => <IntervalSetupFrame values={{ hours: '6', time: '20:00' }} />,
  },
  {
    slug: '212-m1',
    title: 'Medications rows',
    citation: '212·M1',
    render: () => <IntervalListFrame />,
  },
  {
    slug: '212-d1',
    title: 'Detail: every 8 hours',
    citation: '212·D1',
    render: () => <IntervalDetailFrame hours={8} anchor="2026-11-09T05:00:00.000Z" />,
  },
  {
    slug: '212-d2',
    title: 'Detail: every 7 hours, times drift',
    citation: '212·D2',
    render: () => <IntervalDetailFrame hours={7} anchor="2026-11-03T19:00:00.000Z" />,
  },
]
