import type { LabFrame } from '../frames'
import { CorrectionState } from './type-correction-screens'

export const typeCorrectionFrames = [
  {
    slug: '440-s11',
    citation: '440·S11',
    title: 'Offline details retained',
    render: () => <CorrectionState state="offline" />,
  },
  {
    slug: '440-s12',
    citation: '440·S12',
    title: 'Saved medication',
    render: () => <CorrectionState state="saved" />,
  },
  {
    slug: '440-s14',
    citation: '440·S14',
    title: 'Session ended during save',
    render: () => <CorrectionState state="session" />,
  },
] satisfies readonly LabFrame[]
