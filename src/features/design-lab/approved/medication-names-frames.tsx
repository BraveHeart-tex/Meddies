import type { LabFrame } from '../frames'
import { MergedNotificationsSettings } from './medication-names-screens'

/**
 * #384: approved Direction D, this device's notifications, Quiet hours and Medication names as rows
 * of one Notifications group. Turning off, rejected ("Medication names aren't on." / "aren't
 * off."), offline and loading reuse Quiet hours' patterns, with the alert in 384·D4's place.
 */
export const medicationNamesFrames = [
  {
    slug: '384-d1',
    citation: '384·D1',
    title: 'Medication names D - One Notifications group, all Off',
    render: () => <MergedNotificationsSettings names="off" device="off" />,
  },
  {
    slug: '384-d2',
    citation: '384·D2',
    title: 'Medication names D - On, this browser can’t receive',
    render: () => <MergedNotificationsSettings names="on" device="unsupported" />,
  },
  {
    slug: '384-d3',
    citation: '384·D3',
    title: 'Medication names D - Turning on',
    render: () => <MergedNotificationsSettings names="turning-on" device="off" />,
  },
  {
    slug: '384-d4',
    citation: '384·D4',
    title: 'Medication names D - Might not have saved, alert in its row',
    render: () => <MergedNotificationsSettings names="unconfirmed" device="off" />,
  },
] satisfies readonly LabFrame[]
