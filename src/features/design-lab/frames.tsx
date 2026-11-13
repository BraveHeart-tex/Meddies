import type { ReactNode } from 'react'
import { approvedFrames } from './approved/frames'
import { builtFrames } from './built/frames'
import { draftFrames } from './draft/frames'

/**
 * The design lab registry (docs/design/README.md#design-lab). A frame's status is its folder:
 * `draft/` holds design-ticket directions, `approved/` designs waiting for their build ticket and
 * `built/` design-critical screens rendered from production code. Each folder's `frames.tsx`
 * lists its frames; this module stamps the status, so no frame states its own.
 */
type Frame = {
  slug: `${number}-${Lowercase<string>}`
  title: string
  citation: `${number}·${string}`
  render: () => ReactNode
}

/** A draft or approved frame. Only built frames carry a route. */
export type LabFrame = Frame & { route?: never }

/** The screens whose design is checked in the lab, each by exactly one built frame. */
export const designCriticalScreens = [
  'Today',
  'Medications',
  'Medication detail',
  'History',
  'Settings',
  'Cold launch',
] as const

/**
 * A design-critical screen from production code, titled by the screen it shows; `route` is the
 * app route it renders.
 */
export type BuiltFrame = Frame & {
  title: (typeof designCriticalScreens)[number]
  route: `/${string}`
}

export type DesignFrame =
  (LabFrame & { status: 'draft' | 'approved' }) | (BuiltFrame & { status: 'built' })

export const designFrames: readonly DesignFrame[] = [
  ...draftFrames.map((frame) => ({ ...frame, status: 'draft' as const })),
  ...approvedFrames.map((frame) => ({ ...frame, status: 'approved' as const })),
  ...builtFrames.map((frame) => ({ ...frame, status: 'built' as const })),
]
