import type { LabFrame } from '../frames'
import { SettingsWithNotifications, StateSheet } from './notifications-screens'

/** #351: approved Direction D, this device's notifications as a switch row on Settings. */
export const notificationsFrames = [
  {
    slug: '351-d1',
    citation: '351·D1',
    title: 'Switch - Settings, Off',
    render: () => <SettingsWithNotifications state="off" />,
  },
  {
    slug: '351-d2',
    citation: '351·D2',
    title: 'Switch - Settings, On',
    render: () => <SettingsWithNotifications state="on" />,
  },
  {
    slug: '351-d3',
    citation: '351·D3',
    title: 'Switch - Turning on, might not have saved, Blocked on Android Chrome',
    render: () => <StateSheet states={['turning-on', 'unconfirmed', 'blocked-android']} />,
  },
  {
    slug: '351-d4',
    citation: '351·D4',
    title: 'Switch - Blocked on iPhone, iPhone in Safari, Can’t receive',
    render: () => <StateSheet states={['blocked-iphone', 'home-screen', 'unsupported']} />,
  },
] satisfies readonly LabFrame[]
