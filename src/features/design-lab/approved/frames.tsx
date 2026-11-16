import type { LabFrame } from '../frames'
import { editDetailsFormFrames } from './record-form-frames'
import { ScannerFrame } from './scanner-frame'

/** Approved designs waiting for their build ticket. */
export const approvedFrames = [
  {
    slug: '193-b-scanner',
    title: 'Scanner',
    citation: '193·B·Scanner',
    render: () => <ScannerFrame />,
  },
  ...editDetailsFormFrames,
] satisfies readonly LabFrame[]
