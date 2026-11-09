import { Ban, Check, CircleDotDashed, Clock, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import type { PendingDose } from './dose-saves'
import type { DoseOccurrence } from './contract'

const appearances: Record<
  DoseOccurrence['status'],
  {
    icon: LucideIcon
    label: string
    variant: 'taken' | 'skipped' | 'unlogged' | 'scheduled' | 'due'
  }
> = {
  Taken: { icon: Check, label: 'Taken', variant: 'taken' },
  Skipped: { icon: Ban, label: 'Skipped', variant: 'skipped' },
  'Not logged': { icon: CircleDotDashed, label: 'Not logged', variant: 'unlogged' },
  Upcoming: { icon: Clock, label: 'Scheduled', variant: 'scheduled' },
  'Due now': { icon: Clock, label: 'Due now', variant: 'due' },
}

// Status is always text plus icon. `time` is the recorded instant, never the scheduled time.
export function DoseStatusBadge({
  status,
  pending,
  time,
  className,
  id,
}: {
  pending?: PendingDose
  status: DoseOccurrence['status']
  time?: ReactNode
  className?: string
  id?: string
}) {
  const PendingIcon = pending?.unconfirmed ? TriangleAlert : Clock
  if (pending)
    return (
      <Badge
        id={id}
        variant={pending.unconfirmed ? 'unconfirmed' : 'pending'}
        className={className}
      >
        <PendingIcon aria-hidden="true" />
        {pending.unconfirmed ? 'Might not have saved' : `Saving · ${pending.outcome}`}
      </Badge>
    )
  const { icon: Icon, label, variant } = appearances[status]
  return (
    <Badge id={id} variant={variant} className={className}>
      <Icon aria-hidden="true" />
      {label}
      {time && <> {time}</>}
    </Badge>
  )
}
