import type { LabFrame } from '../frames'
import { SharedScreen } from './medication-types-screens'

/** #265: approved Direction B, Type first; B1-B5 and S1-S7 are built (#336, #337, #341, #342); S8-S9 cover wording. */
export const medicationTypesFrames = [
  {
    slug: '265-s8',
    citation: '265·S8',
    title: 'Today wording',
    render: () => <SharedScreen state="today" />,
  },
  {
    slug: '265-s9',
    citation: '265·S9',
    title: 'History wording',
    render: () => <SharedScreen state="history" />,
  },
] satisfies readonly LabFrame[]
