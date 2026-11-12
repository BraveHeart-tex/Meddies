import type { ReactNode } from 'react'
import Loading from '@/app/loading'
import { editFrames } from './edit-frames'
import { intervalFrames } from './interval-frames'
import { lastDayFrames } from './last-day-frames'
import { pauseFrames } from './pause-frames'
import { ScannerFrame } from './scanner-frame'

export type DesignFrame = {
  slug: `${number}-${Lowercase<string>}`
  title: string
  citation: `${number}·${string}`
  render: () => ReactNode
}

export const designFrames = [
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
  ...intervalFrames,
  ...editFrames,
  ...lastDayFrames,
  ...pauseFrames,
] satisfies readonly DesignFrame[]
