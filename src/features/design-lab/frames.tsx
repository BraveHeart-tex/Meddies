import type { ReactNode } from 'react'
import Loading from '@/app/loading'

type DesignFrame = {
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
] satisfies readonly DesignFrame[]
