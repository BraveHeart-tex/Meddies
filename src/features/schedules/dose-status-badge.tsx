import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Icon, type IconName } from '@/components/ui/icon'
import type { PendingDose } from './use-dose-outcome-mutation'
import type { DoseOccurrence } from './contract'

const appearances: Record<
  DoseOccurrence['status'],
  {
    icon: IconName
    label: string
    variant: 'taken' | 'skipped' | 'unlogged' | 'scheduled' | 'due'
    stroke?: number
  }
> = {
  Taken: { icon: 'check', label: 'Taken', variant: 'taken', stroke: 2.4 },
  Skipped: { icon: 'skipped', label: 'Skipped', variant: 'skipped' },
  'Not logged': { icon: 'notLogged', label: 'Not logged', variant: 'unlogged' },
  Upcoming: { icon: 'clock', label: 'Scheduled', variant: 'scheduled' },
  'Due now': { icon: 'clock', label: 'Due now', variant: 'due' },
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
  if (pending)
    return (
      <Badge
        id={id}
        variant={pending.unconfirmed ? 'unconfirmed' : 'pending'}
        className={className}
      >
        <Icon name={pending.unconfirmed ? 'warning' : 'clock'} size={13} />
        {pending.unconfirmed ? 'Not confirmed' : `Saving · ${pending.outcome}`}
      </Badge>
    )
  const { icon, label, variant, stroke } = appearances[status]
  return (
    <Badge id={id} variant={variant} className={className}>
      <Icon name={icon} size={13} strokeWidth={stroke} />
      {label}
      {time && <> {time}</>}
    </Badge>
  )
}
