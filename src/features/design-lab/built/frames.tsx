import Loading from '@/app/loading'
import { SettingsScreen } from '@/app/settings/settings-screen'
import { AppHeader } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { MedicationsHeader } from '@/features/medicines/medications-header'
import { MedicationsScreen } from '@/features/medicines/medications-screen'
import { MedicinePanel } from '@/features/medicines/medicine-panel'
import { HistoryDateNav } from '@/features/schedules/history-date-nav'
import { HistoryResults } from '@/features/schedules/history-results'
import { SchedulePanel } from '@/features/schedules/schedule-panel'
import { SchedulingClockProvider } from '@/features/schedules/scheduling-clock'
import { TodayHeader } from '@/features/schedules/today-header'
import { FixtureQuery } from '../fixture-query'
import type { BuiltFrame } from '../frames'
import { magnesium, NOW, routine, SESSION_EXPIRES, TODAY } from '../lab-fixtures'

/**
 * Design-critical screens rendered from production code, one frame each
 * (docs/design/README.md#built-frames). Each composes what its page renders, with the page's
 * server reads replaced by `routine` seeded into a FixtureQuery. The lab URL selects no tab and
 * carries no Medications view, so frames name the tab, and Medication detail renders the panel
 * its view selects.
 */
export const builtFrames = [
  {
    slug: '238-a1',
    title: 'Today',
    citation: '238·A1',
    route: '/',
    render: () => (
      <FixtureQuery {...routine}>
        <AppShell current="/">
          <ScreenStack>
            <TodayHeader initialNow={NOW} />
            <SchedulePanel mode="today" initialNow={NOW} />
          </ScreenStack>
        </AppShell>
      </FixtureQuery>
    ),
  },
  {
    slug: '238-a2',
    title: 'Medications',
    citation: '238·A2',
    route: '/medications',
    render: () => (
      <FixtureQuery {...routine}>
        <AppShell current="/medications">
          <ScreenStack>
            <MedicationsHeader />
            <MedicationsScreen initialNow={NOW} serverEntry />
          </ScreenStack>
        </AppShell>
      </FixtureQuery>
    ),
  },
  {
    slug: '238-a3',
    title: 'Medication detail',
    citation: '238·A3',
    route: '/medications?medicine=<id>',
    render: () => (
      <FixtureQuery {...routine}>
        <AppShell current="/medications">
          <ScreenStack>
            <MedicinePanel
              scheduleMode="detail"
              detailMedicineId={magnesium.id}
              initialNow={NOW}
              serverEntry
            />
          </ScreenStack>
        </AppShell>
      </FixtureQuery>
    ),
  },
  {
    slug: '238-a4',
    title: 'History',
    citation: '238·A4',
    route: '/history',
    render: () => (
      <FixtureQuery {...routine}>
        <SchedulingClockProvider serverNow={NOW}>
          <AppShell current="/history">
            <ScreenStack>
              <AppHeader title="History" />
              <HistoryDateNav today={TODAY} />
              <HistoryResults today={TODAY} />
            </ScreenStack>
          </AppShell>
        </SchedulingClockProvider>
      </FixtureQuery>
    ),
  },
  {
    slug: '238-a5',
    title: 'Settings',
    citation: '238·A5',
    route: '/settings',
    render: () => (
      <FixtureQuery now={NOW}>
        <SettingsScreen expires={SESSION_EXPIRES} now={NOW} />
      </FixtureQuery>
    ),
  },
  {
    slug: '109-l1',
    title: 'Cold launch',
    citation: '109·L1',
    route: '/',
    render: () => <Loading />,
  },
] satisfies readonly BuiltFrame[]
