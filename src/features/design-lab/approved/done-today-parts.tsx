import type { ReactNode } from 'react'
import { Calendar, Check } from 'lucide-react'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { SchedulePanel } from '@/features/schedules/schedule-panel'
import { TodayHeader } from '@/features/schedules/today-header'
import { cn } from '@/lib/utils'
import { FixtureQuery, type QueryFixtures } from '../fixture-query'
import type { DoneLine } from './done-today-model'

/**
 * #373 lab-only done-for-today line, approved direction B. Each frame renders the built Today
 * (238·A1) from its own fixtures and hides the Up next hero, which production still gives
 * tomorrow's dose; the line takes the hero's slot. Plain text: no button, link or live region.
 */

const ALL_LOGGED = 'All logged for today'

/** A bare status line in the hero's slot, aligned with the list headings. */
export function StatusLine({ line }: { line: DoneLine }) {
  return (
    <div className="flex items-start gap-2.5 px-1 wrap-anywhere">
      {/* Taken's check while To log is empty, otherwise the empty day's calendar. */}
      <span
        aria-hidden="true"
        className={cn(
          'grid size-6.5 shrink-0 place-items-center rounded-full [&>svg]:size-3.5',
          line.allLogged
            ? 'bg-dose-taken text-dose-taken-foreground'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {line.allLogged ? <Check /> : <Calendar />}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 pt-0.5 text-body-sm">
        {line.allLogged && <p className="font-bold">{ALL_LOGGED}</p>}
        {line.next && <p className="text-muted-foreground">{line.next}</p>}
      </div>
    </div>
  )
}

/** Today from `fixtures`, without the hero; `line` takes the hero's slot. */
export function DoneToday({ fixtures, line }: { fixtures: QueryFixtures; line: ReactNode }) {
  return (
    <FixtureQuery {...fixtures}>
      <AppShell current="/">
        <ScreenStack>
          <TodayHeader initialNow={fixtures.now} />
          {line}
          <div className="contents [&_[data-slot=card][data-variant=accent]]:hidden">
            <SchedulePanel mode="today" initialNow={fixtures.now} />
          </div>
        </ScreenStack>
      </AppShell>
    </FixtureQuery>
  )
}
