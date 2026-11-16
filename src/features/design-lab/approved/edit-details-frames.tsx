import type { LabFrame } from '../frames'
import { EditDetailsDetailScreen, EditDetailsHistoryScreen } from './edit-details-screens'

/** #346: approved Direction C, Edit details grouped by its effect on logged doses. */
export const editDetailsFrames = [
  {
    slug: '346-c1',
    citation: '346·C1',
    title: 'Grouped by effect - Medication details',
    render: () => <EditDetailsDetailScreen />,
  },
  {
    slug: '346-c2',
    citation: '346·C2',
    title: 'Grouped by effect - Strength history',
    render: () => <EditDetailsHistoryScreen />,
  },
] satisfies readonly LabFrame[]
