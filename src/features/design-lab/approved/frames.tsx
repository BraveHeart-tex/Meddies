import type { LabFrame } from '../frames'
import { ScannerFrame } from './scanner-frame'

/** Approved designs waiting for their build ticket. */
export const approvedFrames = [
  {
    slug: '193-b-scanner',
    title: 'Scanner',
    citation: '193·B·Scanner',
    render: () => <ScannerFrame />,
  },
] satisfies readonly LabFrame[]
