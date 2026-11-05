import { Pill } from 'lucide-react'
import { cn } from '@/lib/utils'

const tints = [
  'bg-medication-butter',
  'bg-medication-blush',
  'bg-medication-peach',
  'bg-medication-plum',
  'bg-medication-mist',
]

export function MedicationTile({ medicineId }: { medicineId: string }) {
  const tint = tints[medicineId.charCodeAt(medicineId.length - 1) % tints.length]
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-md text-secondary-foreground',
        tint,
      )}
    >
      <Pill className="size-5" />
    </span>
  )
}
