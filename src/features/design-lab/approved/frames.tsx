import type { LabFrame } from '../frames'
import { editDetailsFrames } from './edit-details-frames'
import { editDetailsFormFrames } from './edit-details-form-frames'
import { ScannerFrame } from './scanner-frame'

/** Approved designs waiting for their build ticket. */
export const approvedFrames = [
  {
    slug: '193-b-scanner',
    title: 'Scanner',
    citation: '193·B·Scanner',
    render: () => <ScannerFrame />,
  },
  ...editDetailsFrames,
  ...editDetailsFormFrames,
] satisfies readonly LabFrame[]
