import { cn } from '@/lib/utils'

// Decorative identity: tint and glyph shape are derived from the medicine id.
const identities = [
  { tile: 'bg-medication-butter', glyph: 'bg-medication-butter-glyph', shape: 'round' },
  { tile: 'bg-medication-blush', glyph: 'bg-medication-blush-glyph', shape: 'scored' },
  { tile: 'bg-medication-peach', glyph: 'bg-medication-peach-glyph', shape: 'capsule' },
  { tile: 'bg-medication-plum', glyph: 'bg-medication-plum-glyph', shape: 'square' },
  { tile: 'bg-medication-mist', glyph: 'border-medication-mist-glyph', shape: 'ring' },
] as const

const shapes = {
  round: 'size-[44%] rounded-full',
  scored: 'size-[44%] rounded-full border-2 border-primary',
  capsule: 'h-[55%] w-[22%] rotate-40 rounded-full',
  square: 'size-[44%] rounded-md',
  ring: 'size-[44%] rounded-full border-2 bg-card',
}

export function MedicationTile({
  medicineId,
  size = 'md',
  onAccent = false,
}: {
  medicineId: string
  size?: 'md' | 'lg'
  onAccent?: boolean
}) {
  const identity = identities[medicineId.charCodeAt(medicineId.length - 1) % identities.length]
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center',
        size === 'lg' ? 'size-13 rounded-lg' : 'size-11.5 rounded-md',
        onAccent ? 'bg-card' : identity.tile,
      )}
    >
      <span className={cn('block', shapes[identity.shape], identity.glyph)} />
    </span>
  )
}
