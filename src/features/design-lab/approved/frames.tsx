import type { LabFrame } from '../frames'
import { ScannerFrame } from './scanner-frame'
import { toastFrames } from './toast-frames'

/** Approved designs waiting for their build ticket. */
export const approvedFrames = [
  {
    slug: '193-b-scanner',
    title: 'Scanner',
    citation: '193·B·Scanner',
    render: () => <ScannerFrame />,
  },
  ...toastFrames,
] satisfies readonly LabFrame[]
