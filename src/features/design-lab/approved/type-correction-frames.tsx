import { SimpleCorrection } from './type-correction-simple'
import type { LabFrame } from '../frames'
import { CorrectionState } from './type-correction-screens'

export const typeCorrectionFrames = [
  {
    slug: '440-d1',
    citation: '440·D1',
    title: 'One clear next action',
    render: () => <SimpleCorrection />,
  },
  {
    slug: '440-d2',
    citation: '440·D2',
    title: 'One amount at a time',
    render: () => <SimpleCorrection initialStep="amount" />,
  },
  {
    slug: '440-d3',
    citation: '440·D3',
    title: 'Count capsules',
    render: () => <SimpleCorrection initialStep="stock" />,
  },
  {
    slug: '440-d4',
    citation: '440·D4',
    title: 'Review and save once',
    render: () => <SimpleCorrection initialStep="save" />,
  },
  {
    slug: '440-d5',
    citation: '440·D5',
    title: 'Repair an earlier Schedule amount',
    render: () => <SimpleCorrection initialStep="amount" initialIndex={25} />,
  },
  {
    slug: '440-d6',
    citation: '440·D6',
    title: 'Review compatible amounts with Stock off',
    render: () => <SimpleCorrection initialStep="save" compatibleUntracked />,
  },
  {
    slug: '440-d7',
    citation: '440·D7',
    title: 'Enter a missing dose amount',
    render: () => <SimpleCorrection initialStep="amount" initiallyInvalid />,
  },
  {
    slug: '440-s1',
    citation: '440·S1',
    title: 'Edit an earlier Strength period',
    render: () => <CorrectionState state="edit" />,
  },
  {
    slug: '440-s6',
    citation: '440·S6',
    title: 'Discard repairs',
    render: () => <CorrectionState state="cancel" />,
  },
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
    slug: '440-s13',
    citation: '440·S13',
    title: 'Review could not load',
    render: () => <CorrectionState state="load-error" />,
  },
  {
    slug: '440-s14',
    citation: '440·S14',
    title: 'Session ended during save',
    render: () => <CorrectionState state="session" />,
  },
] satisfies readonly LabFrame[]
