import type { LabFrame } from '../frames'
import { doseHistoryFrames } from './dose-history-frames'
import { ScannerFrame } from './scanner-frame'

/** Approved designs waiting for their build ticket. */
export const approvedFrames = [
  ...doseHistoryFrames,
  {
    slug: '193-b-scanner',
    title: 'Scanner',
    citation: '193·B·Scanner',
    render: () => <ScannerFrame />,
  },
] satisfies readonly LabFrame[]
