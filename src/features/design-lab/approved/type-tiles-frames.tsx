import type { LabFrame } from '../frames'
import { TypeMenuScreen } from './type-tiles-menu'
import { TileSheet } from './type-tiles-parts'

/** #483: approved Direction B, Suppository and Ovule as one two-tone form each. */
export const typeTileFrames = [
  {
    slug: '483-b1',
    citation: '483·B1',
    title: 'Single two-tone - Tiles on the card',
    render: () => <TileSheet />,
  },
  {
    slug: '483-b2',
    citation: '483·B2',
    title: 'Single two-tone - Tiles on the accent card',
    render: () => <TileSheet onAccent />,
  },
  {
    slug: '483-b3',
    citation: '483·B3',
    title: 'Single two-tone - Type menu',
    render: () => <TypeMenuScreen />,
  },
] satisfies readonly LabFrame[]
