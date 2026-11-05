import { Check, CircleDashed, CircleSlash, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DoseOccurrence } from './contract'

const appearances = {
  Taken: { icon: Check, style: 'bg-dose-taken text-dose-taken-foreground' },
  Skipped: { icon: CircleSlash, style: 'bg-dose-skipped text-dose-skipped-foreground' },
  'Not logged': { icon: CircleDashed, style: 'bg-dose-unlogged text-dose-unlogged-foreground' },
  Upcoming: { icon: Clock, style: 'border border-input bg-card text-secondary-foreground' },
  'Due now': { icon: Clock, style: 'bg-accent text-accent-foreground' },
}

export function DoseStatusBadge({ status }: { status: DoseOccurrence['status'] }) {
  const { icon: Icon, style } = appearances[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-extrabold',
        style,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {status === 'Upcoming' ? 'Scheduled' : status}
    </span>
  )
}
