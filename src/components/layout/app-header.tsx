import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/** Settings is a bottom tab, so the title row carries only a page action, if any. */
export function AppHeader({
  title,
  eyebrow,
  subtitle,
  action,
}: {
  title: ReactNode
  eyebrow?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <HeaderFrame action={action} headingClassName="[overflow-wrap:anywhere]">
      {eyebrow && <p className="text-body-sm font-bold text-muted-foreground">{eyebrow}</p>}
      <h1 className="text-display font-extrabold outline-none">{title}</h1>
      {subtitle && <p className="text-caption font-bold text-muted-foreground">{subtitle}</p>}
    </HeaderFrame>
  )
}

/** The header before its eyebrow and title are known: placeholder bars only. */
export function AppHeaderSkeleton() {
  return (
    <HeaderFrame headingClassName="@container">
      <div className="flex h-[1lh] items-center text-body-sm">
        <Skeleton className="h-3 w-30 max-w-full rounded-md" />
      </div>
      <div className="flex flex-col text-display">
        <div className="flex h-[1lh] items-center">
          <Skeleton className="h-6.5 w-50 max-w-full rounded-lg" />
        </div>
        {/* Greetings are 185-212px wide, so a narrower column wraps the title. */}
        <div className="hidden h-[1lh] items-center @max-[12rem]:flex">
          <Skeleton className="h-6.5 w-28 max-w-full rounded-lg" />
        </div>
      </div>
    </HeaderFrame>
  )
}

// Shared by the header and its skeleton so both keep the same geometry.
function HeaderFrame({
  children,
  action,
  headingClassName,
}: {
  children: ReactNode
  action?: ReactNode
  headingClassName: string
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className={`flex min-w-[min(100%,11rem)] flex-1 flex-col gap-1 ${headingClassName}`}>
        {children}
      </div>
      {action && <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  )
}
