'use client'

import { ChevronLeftIcon, CircleDot, List, Pill, Settings2, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * #238 lab chrome, Direction A approved: Settings is the fourth tab and no header carries a
 * Settings button. Copies of AppShell and AppHeader until the build ticket changes production.
 */
export type Page = 'today' | 'medications' | 'history' | 'settings'

const tabs: { page: Page; href: string; label: string; icon: LucideIcon }[] = [
  { page: 'today', href: '/', label: 'Today', icon: CircleDot },
  { page: 'medications', href: '/medications', label: 'Medications', icon: Pill },
  { page: 'history', href: '/history', label: 'History', icon: List },
  { page: 'settings', href: '/settings', label: 'Settings', icon: Settings2 },
]

/** AppShell with four tabs. `page` is the current tab, or null for none (the cold launch). */
export function EntryShell({ page, children }: { page: Page | null; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] pb-[calc(8.125rem+env(safe-area-inset-bottom,0px))]">
      <main className="min-w-0 flex-1">{children}</main>
      <nav
        aria-label="Primary"
        className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom,0px))] z-10 mx-auto max-w-2xl rounded-[2.125rem] border bg-card p-1.5 shadow-nav"
      >
        <ul className="flex gap-1">
          {tabs.map(({ page: tab, href, label, icon: Icon }) => {
            const active = page === tab
            return (
              // Tabs share the width equally but never shrink below their label, so
              // "Medications" stays whole at 320px.
              <li key={tab} className="min-w-fit flex-1">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 rounded-full px-1 [&>svg]:size-5 text-center text-micro [overflow-wrap:anywhere] transition-colors duration-220 ease-calm motion-reduce:transition-none',
                    active
                      ? 'bg-accent font-extrabold text-accent-foreground'
                      : 'font-bold text-muted-foreground',
                  )}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

function HeaderRow({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-[min(100%,11rem)] flex-1 flex-col gap-1 [overflow-wrap:anywhere]">
        {children}
      </div>
      {action && <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  )
}

/** AppHeader without Settings: only a page action, if any, beside the title. */
export function EntryHeader({
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
    <HeaderRow action={action}>
      {eyebrow && <p className="text-body-sm font-bold text-muted-foreground">{eyebrow}</p>}
      <h1 className="text-display font-extrabold outline-none">{title}</h1>
      {subtitle && <p className="text-caption font-bold text-muted-foreground">{subtitle}</p>}
    </HeaderRow>
  )
}

/** AppHeaderSkeleton without Settings. */
export function EntryHeaderSkeleton() {
  return (
    <HeaderRow>
      <div className="flex h-[1lh] items-center text-body-sm">
        <Skeleton className="h-3 w-30 max-w-full rounded-md" />
      </div>
      <div className="flex h-[1lh] items-center text-display">
        <Skeleton className="h-6.5 w-50 max-w-full rounded-lg" />
      </div>
    </HeaderRow>
  )
}

/** A sub-screen's Back row (110 Fix 1) without Settings. */
export function BackRow({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="flex items-start [overflow-wrap:anywhere]">
      <Link
        href={href}
        className={cn(
          buttonVariants({ variant: 'ghost' }),
          '-ml-3 h-auto min-w-0 shrink justify-start py-2 text-left whitespace-normal',
        )}
      >
        <ChevronLeftIcon data-icon="inline-start" aria-hidden="true" className="shrink-0" />
        <span className="min-w-0">{children}</span>
      </Link>
    </div>
  )
}
