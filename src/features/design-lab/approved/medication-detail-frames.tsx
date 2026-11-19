import type { LabFrame } from '../frames'
import { DetailB } from './medication-detail-screens'

/**
 * #403 Medication detail hierarchy: approved Direction B, Summary and Manage. The B states here
 * are the page's states waiting for their build tickets. B1, B3 and B4 are built in 238·A3 (B9
 * to B12 too, #406; B2, B13 and the stock Drawer S1, #409), B14 and B15 in the Manage built
 * frame (#405).
 */
export const medicationDetailFrames = [
  {
    slug: '403-b5',
    citation: '403·B5',
    title: 'Medication detail - Ended',
    render: () => <DetailB state="ended" />,
  },
  {
    slug: '403-b6',
    citation: '403·B6',
    title: 'Medication detail - No schedule, Delete available',
    render: () => <DetailB state="none" />,
  },
  {
    slug: '403-b7',
    citation: '403·B7',
    title: 'Medication detail - No schedule, after Add medicine save',
    render: () => <DetailB state="saved" />,
  },
  {
    slug: '403-b8',
    citation: '403·B8',
    title: 'Medication detail - Archived',
    render: () => <DetailB state="archived" />,
  },
] satisfies readonly LabFrame[]
