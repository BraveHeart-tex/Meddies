import type { LabFrame } from '../frames'
import { medicationNamesFrames } from './medication-names-frames'
import { ScannerFrame } from './scanner-frame'

/** Approved designs waiting for their build ticket. */
export const approvedFrames = [
  ...medicationNamesFrames,
  {
    slug: '193-b-scanner',
    title: 'Scanner',
    citation: '193·B·Scanner',
    render: () => <ScannerFrame />,
  },
] satisfies readonly LabFrame[]
