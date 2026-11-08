'use client'

import { Icon } from '@/components/ui/icon'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DoseOutcomeRecord } from './contract'

type Outcome = DoseOutcomeRecord['outcome']

export function OutcomeChoice({
  doseId,
  value,
  disabled,
  onChoose,
}: {
  doseId: string
  value: Outcome | null
  disabled: (outcome: Outcome) => boolean
  onChoose: (outcome: Outcome) => void
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <span id={`outcome-${doseId}`} className="font-extrabold">
        What happened?
      </span>
      <ToggleGroup
        data-base-ui-swipe-ignore="y"
        aria-labelledby={`outcome-${doseId}`}
        variant="choice"
        size="lg"
        spacing={2.5}
        className="grid w-full grid-cols-2"
        value={value ? [value] : []}
        onValueChange={(next) => {
          const outcome = next[0] as Outcome | undefined
          if (outcome) onChoose(outcome)
        }}
      >
        {(['Taken', 'Skipped'] as const).map((outcome) => (
          <ToggleGroupItem
            key={outcome}
            value={outcome}
            disabled={disabled(outcome)}
            className="w-full"
          >
            {value === outcome ? (
              <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                <Icon
                  name={outcome === 'Taken' ? 'check' : 'skipped'}
                  size={14}
                  strokeWidth={2.4}
                />
              </span>
            ) : (
              <Icon
                name={outcome === 'Taken' ? 'check' : 'skipped'}
                size={24}
                strokeWidth={1.4}
                className="text-muted-foreground"
              />
            )}
            {outcome === 'Taken' ? 'I took it' : 'I skipped it'}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
