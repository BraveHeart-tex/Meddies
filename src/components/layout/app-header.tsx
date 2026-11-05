'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'

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
  const pathname = usePathname()
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-[min(100%,11rem)] flex-1 flex-col gap-1 [overflow-wrap:anywhere]">
        {eyebrow && <p className="text-body-sm font-bold text-muted-foreground">{eyebrow}</p>}
        <h1 className="text-display font-extrabold">{title}</h1>
        {subtitle && <p className="text-caption font-bold text-muted-foreground">{subtitle}</p>}
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
