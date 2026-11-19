import type { LabFrame } from '../frames'
import { StockOffDrawerScreen, StockOnDrawerScreen } from './stock-drawers'
import { StockDetailScreen } from './stock-screens'

/**
 * #392 Stock tracking: approved Direction A, Stock card. The Medication detail section off and on,
 * the turn-on drawer with its field error and the turn-off confirm (#393). The Medications row
 * count and the Add medicine Stock row are built (#394).
 */
export const stockFrames = [
  {
    slug: '392-a1',
    citation: '392·A1',
    title: 'Stock card - Off',
    render: () => <StockDetailScreen tracked={false} />,
  },
  {
    slug: '392-a2',
    citation: '392·A2',
    title: 'Stock card - On',
    render: () => <StockDetailScreen tracked />,
  },
  {
    slug: '392-s1',
    citation: '392·S1',
    title: 'Stock - Turn-on drawer field error',
    render: () => <StockOnDrawerScreen />,
  },
  {
    slug: '392-s2',
    citation: '392·S2',
    title: 'Stock - Turn-off confirm',
    render: () => <StockOffDrawerScreen />,
  },
] satisfies readonly LabFrame[]
