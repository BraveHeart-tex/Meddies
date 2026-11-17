'use client'

import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from '@/lib/utils'

/**
 * Cozy Care switch: the input-colored track turns berry when on, under a card-colored thumb.
 * The 28px track extends its touch target to 44px.
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-input p-0.5 transition-colors duration-140 ease-calm after:absolute after:-inset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:bg-primary data-disabled:opacity-45 motion-reduce:transition-none',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="size-6 rounded-full bg-card shadow-nav transition-transform duration-140 ease-calm data-checked:translate-x-5 motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
