import type { ReactNode } from 'react'
import Loading from '@/app/loading'
import { intervalFrames } from './interval-frames'
import { ScannerFrame } from './scanner-frame'

export type DesignFrame = {
  slug: `${number}-${Lowercase<string>}`
  title: string
  citation: `${number}·${string}`
  render: () => ReactNode
}

export const designFrames = [
  {
    slug: '649-l1',
    title: 'Cold launch',
    citation: '649·L1',
    render: () => <Loading />,
  },
  {
    slug: '745-b-scanner',
    title: 'Scanner',
    citation: '745·B·Scanner',
    render: () => <ScannerFrame />,
  },
  ...intervalFrames,
] satisfies readonly DesignFrame[]
