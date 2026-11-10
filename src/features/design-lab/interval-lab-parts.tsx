'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Field, FieldTitle } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ScheduleForm } from '@/features/schedules/schedule-form'
import { magnesium, TODAY, NOW } from './interval-lab-model'

/** The set-up screen for one medication, a full-screen modal that covers the tabs. */
export function SetupFrame({
  kind = 'interval',
  header,
  children,
}: {
  kind?: 'times' | 'interval'
  header: ReactNode
  children: ReactNode
}) {
  const [client] = useState(() => new QueryClient())
  const [current, setCurrent] = useState(kind)
  const content = (
    <section
      aria-labelledby="schedule-heading"
      className="flex flex-1 flex-col gap-5 [overflow-wrap:anywhere]"
    >
      {header}
      {current === 'times' && (
        <p className="text-body-sm text-muted-foreground">
          Times are Istanbul time. Doses start from the next time after you save. Earlier times
          today aren&apos;t added.
        </p>
      )}
      <Field>
        <FieldTitle
          id="schedule-kind-label"
          className="text-body-sm font-bold text-muted-foreground"
        >
          When do you take it?
        </FieldTitle>
        <ToggleGroup
          variant="outline"
          spacing={1.5}
          className="grid w-full grid-cols-2"
          aria-labelledby="schedule-kind-label"
          value={[current]}
          onValueChange={(next) => {
            const choice = next[0] as 'times' | 'interval' | undefined
            if (choice) setCurrent(choice)
          }}
        >
          <ToggleGroupItem value="times">Set times</ToggleGroupItem>
          <ToggleGroupItem value="interval">Every few hours</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      {current === 'times' ? (
        <ScheduleForm
          medicine={magnesium}
          today={TODAY}
          serverNow={NOW}
          onSaved={() => {}}
          onConflict={() => {}}
        />
      ) : (
        children
      )}
    </section>
  )
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto flex min-h-svh max-w-2xl flex-col px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        {content}
      </main>
    </QueryClientProvider>
  )
}
