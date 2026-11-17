import type { LabFrame } from '../frames'
import { QuietHoursSettings } from './quiet-hours-screens'

/**
 * #380: approved Direction A, account-wide quiet hours as their own Settings group under
 * Notifications. A rejected Turn on reuses 380·A4's alert placement.
 */
export const quietHoursFrames = [
  {
    slug: '380-a1',
    citation: '380·A1',
    title: 'Quiet hours - Settings, Off',
    render: () => <QuietHoursSettings quiet="off" device="off" />,
  },
  {
    slug: '380-a2',
    citation: '380·A2',
    title: 'Quiet hours - On, this browser can’t receive',
    render: () => <QuietHoursSettings quiet="on" device="unsupported" />,
  },
  {
    slug: '380-a3',
    citation: '380·A3',
    title: 'Quiet hours - Turning on',
    render: () => <QuietHoursSettings quiet="turning-on" device="off" />,
  },
  {
    slug: '380-a4',
    citation: '380·A4',
    title: 'Quiet hours - Might not have saved',
    render: () => <QuietHoursSettings quiet="unconfirmed" device="off" />,
  },
] satisfies readonly LabFrame[]
