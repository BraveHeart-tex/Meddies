import type { LabFrame } from '../frames'
import { ScannerFrame } from './scanner-frame'
import { unscheduledFrames } from './unscheduled-frames'

/** Approved designs waiting for their build ticket. */
export const approvedFrames = [
  {
    slug: '193-b-scanner',
    title: 'Scanner',
    citation: '193·B·Scanner',
    render: () => <ScannerFrame />,
  },
  ...unscheduledFrames,
] satisfies readonly LabFrame[]
