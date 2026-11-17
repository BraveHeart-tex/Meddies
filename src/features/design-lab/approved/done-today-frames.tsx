import type { LabFrame } from '../frames'
import { daysAway, lateNight, noNext, yesterdayLeft } from './done-today-model'
import { DoneToday, StatusLine } from './done-today-parts'

/**
 * #373 approved direction B, Status line, for Today once nothing is left to feature today. Every
 * frame is the built Today (238·A1) without the Up next hero: 23:50 with a 00:30 dose tomorrow, a
 * next dose days away, no next dose, and only yesterday's To log doses older than the 80-minute
 * window.
 */

export const doneTodayFrames = [
  {
    slug: '373-b1',
    title: 'Done for today: next at 00:30 tomorrow',
    citation: '373·B1',
    render: () => (
      <DoneToday fixtures={lateNight.fixtures} line={<StatusLine line={lateNight.line} />} />
    ),
  },
  {
    slug: '373-b2',
    title: 'Done for today: next days away',
    citation: '373·B2',
    render: () => (
      <DoneToday fixtures={daysAway.fixtures} line={<StatusLine line={daysAway.line} />} />
    ),
  },
  {
    slug: '373-b3',
    title: 'Done for today: no next dose',
    citation: '373·B3',
    render: () => <DoneToday fixtures={noNext.fixtures} line={<StatusLine line={noNext.line} />} />,
  },
  {
    slug: '373-b4',
    title: 'Done for today: yesterday in To log',
    citation: '373·B4',
    render: () => (
      <DoneToday
        fixtures={yesterdayLeft.fixtures}
        line={<StatusLine line={yesterdayLeft.line} />}
      />
    ),
  },
] satisfies readonly LabFrame[]
