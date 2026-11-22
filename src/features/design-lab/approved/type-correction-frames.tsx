import type { LabFrame } from '../frames'
import { CorrectionState } from './type-correction-screens'

export const typeCorrectionFrames = [
  {
    slug: '440-s7',
    citation: '440·S7',
    title: 'Saving the whole change',
    render: () => <CorrectionState state="pending" />,
  },
  {
    slug: '440-s8',
    citation: '440·S8',
    title: 'Retry the same attempt',
    render: () => <CorrectionState state="unconfirmed" />,
  },
  {
    slug: '440-s9',
    citation: '440·S9',
    title: 'Definite rejection',
    render: () => <CorrectionState state="rejected" />,
  },
  {
    slug: '440-s10',
    citation: '440·S10',
    title: 'Stale review',
    render: () => <CorrectionState state="stale" />,
  },
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
