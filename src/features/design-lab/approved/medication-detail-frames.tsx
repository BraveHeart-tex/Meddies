import type { LabFrame } from '../frames'
import { DetailB, ManageB, StockDrawerScreen } from './medication-detail-screens'

/**
 * #403 Medication detail hierarchy: approved Direction B, Summary and Manage. B1 to B13 are the
 * page's states, B14 and B15 the Manage sub-screen, and S1 the stock Drawer the Stock row opens.
 */
export const medicationDetailFrames = [
  {
    slug: '403-b1',
    citation: '403·B1',
    title: 'Medication detail - Clock running, Last day, stock off',
    render: () => <DetailB state="clock" />,
  },
  {
    slug: '403-b2',
    citation: '403·B2',
    title: 'Medication detail - Interval running, stock on',
    render: () => <DetailB state="interval" />,
  },
  {
    slug: '403-b3',
    citation: '403·B3',
    title: 'Medication detail - Starts in the future',
    render: () => <DetailB state="future" />,
  },
  {
    slug: '403-b4',
    citation: '403·B4',
    title: 'Medication detail - Paused',
    render: () => <DetailB state="paused" />,
  },
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
  {
    slug: '403-b9',
    citation: '403·B9',
    title: 'Medication detail - Loading',
    render: () => <DetailB state="loading" />,
  },
  {
    slug: '403-b10',
    citation: '403·B10',
    title: 'Medication detail - Schedule load error',
    render: () => <DetailB state="error" />,
  },
  {
    slug: '403-b11',
    citation: '403·B11',
    title: 'Medication detail - Refresh failed',
    render: () => <DetailB state="refresh" />,
  },
  {
    slug: '403-b12',
    citation: '403·B12',
    title: 'Medication detail - Long name and strength',
    render: () => <DetailB state="long" />,
  },
  {
    slug: '403-b13',
    citation: '403·B13',
    title: 'Medication detail - Future feature places',
    render: () => <DetailB state="slots" />,
  },
  {
    slug: '403-b14',
    citation: '403·B14',
    title: 'Medication detail - Manage, running',
    render: () => <ManageB state="slots" />,
  },
  {
    slug: '403-b15',
    citation: '403·B15',
    title: 'Medication detail - Manage, Delete available',
    render: () => <ManageB state="none" />,
  },
  {
    slug: '403-s1',
    citation: '403·S1',
    title: 'Medication detail - Stock Drawer',
    render: () => <StockDrawerScreen />,
  },
] satisfies readonly LabFrame[]
