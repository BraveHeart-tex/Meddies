import type { LabFrame } from '../frames'
import { scanFillFrames } from './scan-fill-frames'

/** Approved designs waiting for their build ticket. */
export const approvedFrames = [...scanFillFrames] satisfies readonly LabFrame[]
