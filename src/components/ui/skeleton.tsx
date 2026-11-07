import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A static placeholder for content that has not loaded. The caller sets its width, radius and
 * minimum height to match the loaded layout. It never animates and is hidden from assistive
 * technology; the surrounding `LoadingSection` announces the loading state once.
 */
function Skeleton({
  className,
  tone = 'sunken',
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & { tone?: 'sunken' | 'blush' }) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      data-tone={tone}
      className={cn('bg-muted data-[tone=blush]:bg-accent', className)}
      {...props}
    />
  )
}

/**
 * One loading section with a single polite status label. Real controls inside it, such as the
 * header's Settings button, stay reachable; only `Skeleton` placeholders are hidden.
 */
function LoadingSection({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div data-slot="loading-section" className={className}>
      <p role="status" className="sr-only">
        {label}
      </p>
      {children}
    </div>
  )
}

export { Skeleton, LoadingSection }
