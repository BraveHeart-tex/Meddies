import type { LabFrame } from '../frames'
import { ScannerFrame } from './scanner-frame'
import { stockFrames } from './stock-frames'

/** Approved designs waiting for their build ticket. */
export const approvedFrames = [
  {
    slug: '193-b-scanner',
    title: 'Scanner',
    citation: '193·B·Scanner',
    render: () => <ScannerFrame />,
  },
  ...stockFrames,
] satisfies readonly LabFrame[]
