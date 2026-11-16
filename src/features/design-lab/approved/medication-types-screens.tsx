'use client'

import type { SharedState } from './medication-types-model'
import { HistoryScreen, TodayScreen } from './medication-types-parts'

export function SharedScreen({ state }: { state: SharedState }) {
  switch (state) {
    case 'today':
      return <TodayScreen />
    case 'history':
      return <HistoryScreen />
  }
}
