import type { LabFrame } from '../frames'
import { DoseHistoryDetailScreen, DoseHistoryEmptyScreen } from './dose-history-parts'
import { CardsEndScreen, CardsTopScreen } from './dose-history-screens'

/** #387 Dose history: approved Direction B, Day cards, with the shared row and empty state. */
export const doseHistoryFrames = [
  {
    slug: '387-s1',
    citation: '387·S1',
    title: 'Dose history - Medication detail row',
    render: () => <DoseHistoryDetailScreen />,
  },
  {
    slug: '387-s2',
    citation: '387·S2',
    title: 'Dose history - No doses taken',
    render: () => <DoseHistoryEmptyScreen />,
  },
  {
    slug: '387-b1',
    citation: '387·B1',
    title: 'Day cards - Summary and newest days',
    render: () => <CardsTopScreen />,
  },
  {
    slug: '387-b2',
    citation: '387·B2',
    title: 'Day cards - Strength split and earlier days',
    render: () => <CardsEndScreen />,
  },
] satisfies readonly LabFrame[]
