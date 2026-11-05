'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

const destinations: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'Today', icon: 'today' },
  { href: '/medications', label: 'Medications', icon: 'medications' },
  { href: '/history', label: 'History', icon: 'history' },
]

// Pages render their own AppHeader so the title row can carry page actions beside Settings.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] pb-[calc(8.125rem+env(safe-area-inset-bottom,0px))]">
      <main className="min-w-0 flex-1">{children}</main>
      <nav
        aria-label="Primary"
        className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom,0px))] z-10 mx-auto max-w-2xl rounded-[2.125rem] border bg-card p-1.5 shadow-nav"
      >
        <ul className="grid grid-cols-3 gap-1">
          {destinations.map(({ href, label, icon }) => {
            const active = pathname === href
            return (
              <li key={href} className="min-w-0">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 rounded-full px-1 text-center text-micro [overflow-wrap:anywhere] transition-colors duration-220 ease-calm motion-reduce:transition-none',
                    active
                      ? 'bg-accent font-extrabold text-accent-foreground'
                      : 'font-bold text-muted-foreground',
                  )}
                >
                  <Icon name={icon} size={20} />
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
