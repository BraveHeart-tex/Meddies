import type { ReactNode } from 'react'
import type { DesignFrame } from './frames'
import {
  DetailScreen,
  HistoryScreen,
  LaunchScreen,
  MedicationsScreen,
  SettingsScreen,
  TodayScreen,
} from './settings-entry-screens'

const screens: [string, () => ReactNode][] = [
  ['Today', TodayScreen],
  ['Medications', MedicationsScreen],
  ['Medication detail', DetailScreen],
  ['History', HistoryScreen],
  ['Settings', SettingsScreen],
  ['Cold launch', LaunchScreen],
]

/**
 * #238, Direction A approved: Settings is the fourth tab and headers carry only page actions.
 * A1-A6 are Today, Medications, Medication detail, History, Settings and the cold launch.
 */
export const settingsEntryFrames: readonly DesignFrame[] = screens.map(
  ([title, Screen], index): DesignFrame => ({
    slug: `238-a${index + 1}` as DesignFrame['slug'],
    title: `Fourth tab, ${title}`,
    citation: `238·A${index + 1}` as DesignFrame['citation'],
    render: () => <Screen />,
  }),
)
