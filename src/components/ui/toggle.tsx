'use client'

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const toggleVariants = cva(
  'group/toggle inline-flex items-center justify-center gap-1.5 rounded-md text-body-sm font-extrabold transition-[background-color,border-color,color,transform] duration-140 ease-calm select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-transparent hover:bg-muted aria-pressed:bg-muted',
        outline:
          'border border-border-strong bg-card whitespace-nowrap text-foreground aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground',
        choice:
          'border-[1.5px] border-border-strong bg-card text-body-lg text-foreground aria-pressed:border-2 aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground',
      },
      size: {
        default:
          'min-h-12 min-w-18 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5',
        sm: "min-h-11 min-w-11 rounded-sm px-3 text-label has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'min-h-19 flex-col items-start justify-between rounded-xl px-3.5 py-3 text-left whitespace-normal',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Toggle({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
