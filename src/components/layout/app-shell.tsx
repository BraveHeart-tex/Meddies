'use client'

import { CalendarDays, History, Pill, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const destinations = [
  { href: '/', label: 'Today', icon: CalendarDays },
  { href: '/medications', label: 'Medications', icon: Pill },
  { href: '/history', label: 'History', icon: History },
]

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col px-5 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-[calc(1rem+env(safe-area-inset-top,0px))]">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-xl font-extrabold tracking-tight"
        >
          Meddies
        </Link>
        <Link
          href="/settings"
          aria-label="Settings"
          aria-current={pathname === '/settings' ? 'page' : undefined}
          className="inline-flex size-11 items-center justify-center rounded-full border border-input bg-card aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
        >
          <Settings className="size-5" aria-hidden="true" />
        </Link>
      </header>
      <main className="min-w-0 flex-1">{children}</main>
      <nav
        aria-label="Primary"
        className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom,0px))] z-10 mx-auto max-w-2xl rounded-[2rem] border bg-card p-1.5 shadow-nav"
      >
        <ul className="grid grid-cols-3 gap-1">
          {destinations.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <li key={href} className="min-w-0">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 rounded-full px-1 text-center text-xs leading-tight font-bold [overflow-wrap:anywhere]',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
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
