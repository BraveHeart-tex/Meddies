import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-base font-extrabold transition-[background-color,border-color,transform] duration-140 ease-calm motion-reduce:transition-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:not-aria-[haspopup]:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary-pressed active:bg-primary-pressed',
        outline:
          'border-border-strong bg-card text-foreground hover:bg-muted active:bg-muted aria-expanded:bg-muted',
        soft: 'bg-accent text-accent-foreground hover:bg-accent-pressed active:bg-accent-pressed',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'text-secondary-foreground hover:bg-muted active:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'min-h-11.5 gap-2 rounded-md px-4.5 has-data-[icon=inline-end]:px-3 has-data-[icon=inline-start]:px-3.5',
        xs: "min-h-11 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:px-1.5 has-data-[icon=inline-start]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-11 gap-1.5 rounded-sm px-3 text-label in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:px-2 has-data-[icon=inline-start]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "min-h-13 gap-2 px-5 text-body-lg has-data-[icon=inline-end]:px-3 has-data-[icon=inline-start]:px-4 [&_svg:not([class*='size-'])]:size-4.5",
        drawer: 'min-h-14 gap-2 rounded-xl px-6 text-body-lg',
        icon: 'size-11',
        'icon-xs':
          "size-11 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-11 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
