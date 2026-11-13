import Loading from '@/app/loading'
import type { LabFrame } from '../frames'
import { ScannerFrame } from './scanner-frame'
import { settingsEntryFrames } from './settings-entry-frames'
import { unscheduledFrames } from './unscheduled-frames'

/** Approved designs waiting for their build ticket. */
export const approvedFrames = [
  {
    slug: '109-l1',
    title: 'Cold launch',
    citation: '109·L1',
    render: () => <Loading />,
  },
  {
    slug: '193-b-scanner',
    title: 'Scanner',
    citation: '193·B·Scanner',
    render: () => <ScannerFrame />,
  },
  ...settingsEntryFrames,
  ...unscheduledFrames,
] satisfies readonly LabFrame[]
