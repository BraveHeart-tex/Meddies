import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { MedicationsHeader } from '@/features/medicines/medications-header'
import { MedicationsScreen } from '@/features/medicines/medications-screen'
import { MedicinePanel } from '@/features/medicines/medicine-panel'
import { SchedulePanel } from '@/features/schedules/schedule-panel'
import { TodayHeader } from '@/features/schedules/today-header'
import { FixtureQuery } from '../fixture-query'
import type { LabFrame } from '../frames'
import { amoxicillin, NOW, routine } from '../lab-fixtures'
import { catalog, confirmations, receiptRow as dir, type LabToast } from './toast-model'
import { LabNote, LabToastCard, LabToastHost, Narrow } from './toast-parts'

/**
 * #371 approved direction A, Receipt row, for floating save confirmations. Each frame composes a
 * built screen (238·A1-A3) with a lab Toast held in one state; the dashed note states what a still frame can't.
 */

function Detail({ children }: { children?: ReactNode }) {
  return (
    <FixtureQuery {...routine}>
      <AppShell current="/medications">
        <ScreenStack>
          <MedicinePanel
            scheduleMode="detail"
            detailMedicineId={amoxicillin.id}
            initialNow={NOW}
            serverEntry
          />
        </ScreenStack>
      </AppShell>
      {children}
    </FixtureQuery>
  )
}

function Medications({ children }: { children?: ReactNode }) {
  return (
    <FixtureQuery {...routine}>
      <AppShell current="/medications">
        <ScreenStack>
          <MedicationsHeader />
          <MedicationsScreen initialNow={NOW} serverEntry />
        </ScreenStack>
      </AppShell>
      {children}
    </FixtureQuery>
  )
}

function Today({ children }: { children?: ReactNode }) {
  return (
    <FixtureQuery {...routine}>
      <AppShell current="/">
        <ScreenStack>
          <TodayHeader initialNow={NOW} />
          <SchedulePanel mode="today" initialNow={NOW} />
        </ScreenStack>
      </AppShell>
      {children}
    </FixtureQuery>
  )
}

function frames(ids: readonly string[], cites: readonly string[]) {
  const card = (toast: LabToast = confirmations.scheduleSaved) => <LabToastCard toast={toast} />
  const list: { title: string; render: () => ReactNode }[] = [
    {
      title: 'Schedule saved on Medication detail',
      render: () => (
        <Detail>
          <LabNote>
            {dir.name} · {dir.swipe} · {dir.timing}
          </LabNote>
          <LabToastHost>{card()}</LabToastHost>
        </Detail>
      ),
    },
    {
      title: 'Deleted on Medications',
      render: () => (
        <Medications>
          <LabNote>Deletion: no glyph. {dir.timing}</LabNote>
          <LabToastHost>{card(confirmations.deleted)}</LabToastHost>
        </Medications>
      ),
    },
    {
      title: 'Already taken on Today',
      render: () => (
        <Today>
          <LabNote>Taken: check glyph. Replaces the inline confirmation Alert.</LabNote>
          <LabToastHost>{card(confirmations.alreadyTaken)}</LabToastHost>
        </Today>
      ),
    },
    {
      title: 'Confirmations 1-8',
      render: () => (
        <main className="flex min-h-svh flex-col gap-2.5 bg-background px-4 py-4">
          <p className="text-label font-semibold text-muted-foreground">
            Confirmations 1-8 · check for a save, none for a pause, stop or deletion
          </p>
          {[...catalog, confirmations.strengthChange].map((toast) => (
            <LabToastCard key={toast.title} toast={toast} />
          ))}
        </main>
      ),
    },
    {
      title: 'Two Toasts collapsed',
      render: () => (
        <Detail>
          <LabNote>{dir.stack}. Tap or focus expands the stack.</LabNote>
          <LabToastHost>
            <div className="relative">
              <LabToastCard
                toast={confirmations.fixedDetails}
                className="absolute inset-x-0 bottom-0"
                style={{ transform: 'translateY(-0.875rem) scale(0.92)', opacity: 0.6 }}
              />
              <LabToastCard toast={confirmations.scheduleSaved} />
            </div>
          </LabToastHost>
        </Detail>
      ),
    },
    {
      title: 'Two Toasts expanded',
      render: () => (
        <Detail>
          <LabNote>
            Expanded: each Toast keeps its own Dismiss. Timers stay paused while expanded.
          </LabNote>
          <LabToastHost>
            <div className="flex flex-col gap-2.5">
              {card(confirmations.fixedDetails)}
              {card()}
            </div>
          </LabToastHost>
        </Detail>
      ),
    },
    {
      title: 'Long name at 320px',
      render: () => (
        <Narrow>
          <Detail>
            <LabNote>320px: the name wraps; Dismiss stays 44px.</LabNote>
            <LabToastHost>{card(confirmations.longName)}</LabToastHost>
          </Detail>
        </Narrow>
      ),
    },
  ]
  return list.map((frame, i) => ({
    slug: ids[i] as LabFrame['slug'],
    citation: cites[i] as LabFrame['citation'],
    title: `${dir.name}: ${frame.title}`,
    render: frame.render,
  }))
}

export const toastFrames: readonly LabFrame[] = frames(
  ['371-a1', '371-a2', '371-a3', '371-a4', '371-a8', '371-a9', '371-a10'],
  ['371·A1', '371·A2', '371·A3', '371·A4', '371·A8', '371·A9', '371·A10'],
)
