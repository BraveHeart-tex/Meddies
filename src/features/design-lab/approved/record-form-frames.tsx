import type { LabFrame } from '../frames'
import {
  amoxicillinRecord,
  ibuprofenRecord,
  magnesiumRecord,
  vitaminDRecord,
} from './record-form-model'
import { GroupedForm } from './record-form-screens'

/** #347: approved Direction C, the Edit details form grouped by what can change. */
export const editDetailsFormFrames = [
  {
    slug: '347-c1',
    citation: '347·C1',
    title: 'Grouped by what can change - Tablet, Type changeable',
    render: () => <GroupedForm medicine={vitaminDRecord} />,
  },
  {
    slug: '347-c2',
    citation: '347·C2',
    title: 'Grouped by what can change - Tablet, Type locked',
    render: () => <GroupedForm medicine={magnesiumRecord} />,
  },
  {
    slug: '347-c3',
    citation: '347·C3',
    title: 'Grouped by what can change - Liquid, Type changeable',
    render: () => <GroupedForm medicine={ibuprofenRecord} />,
  },
  {
    slug: '347-c4',
    citation: '347·C4',
    title: 'Grouped by what can change - Liquid, Type locked',
    render: () => <GroupedForm medicine={amoxicillinRecord} />,
  },
] satisfies readonly LabFrame[]
