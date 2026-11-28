import type { LabFrame } from '../frames'
import { typeTileFrames } from './type-tiles-frames'

/** Approved designs waiting for their build ticket. */
export const approvedFrames: readonly LabFrame[] = [...typeTileFrames]
