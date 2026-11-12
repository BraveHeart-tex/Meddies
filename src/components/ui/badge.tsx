import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1.25 overflow-hidden rounded-full border border-transparent px-2.5 py-1.75 text-label leading-none font-extrabold whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:px-1.5 has-data-[icon=inline-start]:px-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-[13px]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive:
          'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
        taken: 'bg-dose-taken text-dose-taken-foreground',
        unlogged: 'bg-dose-unlogged text-dose-unlogged-foreground',
        skipped: 'bg-dose-skipped text-dose-skipped-foreground',
        scheduled: 'border-border-strong py-1.5 text-secondary-foreground',
        due: 'bg-accent text-accent-foreground',
        // A save in flight (650·D21): dashed outline, e.g. "Saving · Taken".
        pending: 'border-dashed border-border-strong py-1.5 text-secondary-foreground',
        // A save that could not be confirmed (650·D21): dashed amber with a warning glyph.
        unconfirmed:
          'border-dashed border-dose-unlogged-foreground/50 bg-dose-unlogged py-1.5 text-dose-unlogged-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  })
}

export { Badge, badgeVariants }
