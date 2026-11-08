'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function AppHeader({
  title,
  eyebrow,
  subtitle,
  action,
  align = 'start',
}: {
  title: ReactNode
  eyebrow?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  /**
   * `center` lines a title-only page up with Settings. It is set per page, never derived from
   * `subtitle`, so a title does not move when a subtitle arrives.
   */
  align?: 'start' | 'center'
}) {
  return (
    <HeaderFrame action={action} align={align} headingClassName="[overflow-wrap:anywhere]">
      {eyebrow && <p className="text-body-sm font-bold text-muted-foreground">{eyebrow}</p>}
      <h1 className="text-display font-extrabold outline-none">{title}</h1>
      {subtitle && <p className="text-caption font-bold text-muted-foreground">{subtitle}</p>}
    </HeaderFrame>
  )
}

/** The header before its eyebrow and title are known: placeholder bars beside the real Settings. */
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
  align = 'start',
  headingClassName,
}: {
  children: ReactNode
  action?: ReactNode
  align?: 'start' | 'center'
  headingClassName: string
}) {
  const pathname = usePathname()
  return (
    <header
      className={cn(
        'flex flex-wrap justify-between gap-3',
        align === 'center' ? 'items-center' : 'items-start',
      )}
    >
      <div className={cn('flex min-w-[min(100%,11rem)] flex-1 flex-col gap-1', headingClassName)}>
        {children}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {action}
        <Link
          href="/settings"
          aria-label="Settings"
          aria-current={pathname === '/settings' ? 'page' : undefined}
          className="inline-flex size-11 items-center justify-center rounded-full border bg-card text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
        >
          <Icon name="settings" size={20} />
        </Link>
      </div>
    </header>
  )
}
