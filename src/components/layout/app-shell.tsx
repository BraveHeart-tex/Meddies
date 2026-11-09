'use client'

import { CircleDot, List, Pill, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { showMedicationsView } from '@/features/medicines/medications-nav'
import { cn } from '@/lib/utils'

const destinations: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/', label: 'Today', icon: CircleDot },
  { href: '/medications', label: 'Medications', icon: Pill },
  { href: '/history', label: 'History', icon: List },
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
          {destinations.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <li key={href} className="min-w-0">
                <Link
                  href={href}
                  onNavigate={
                    // The Medications tab from another Medications view is only a view change.
                    active && href === '/medications'
                      ? (event) => {
                          event.preventDefault()
                          showMedicationsView(href)
                        }
                      : undefined
                  }
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
