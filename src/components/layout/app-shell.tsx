'use client'

import { CircleDot, List, Pill, Settings2, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { showMedicationsView } from '@/features/medicines/medications-nav'
import { cn } from '@/lib/utils'

const destinations: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/', label: 'Today', icon: CircleDot },
  { href: '/medications', label: 'Medications', icon: Pill },
  { href: '/history', label: 'History', icon: List },
  { href: '/settings', label: 'Settings', icon: Settings2 },
]

/**
 * Pages render their own AppHeader so the title row can carry page actions. `current` overrides
 * the tab chosen from the URL, for design lab frames.
 */
export function AppShell({
  children,
  current,
  showNavigation = true,
}: {
  children: ReactNode
  current?: string
  showNavigation?: boolean
}) {
  const urlPathname = usePathname()
  const pathname = current ?? urlPathname

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] pb-[calc(8.125rem+env(safe-area-inset-bottom,0px))]">
      <main className="min-w-0 flex-1">{children}</main>
      {showNavigation && (
        <nav
          aria-label="Primary"
          // Display none so a full-screen modal also takes the tabs out of the focus order.
          className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom,0px))] z-10 mx-auto max-w-2xl [body:has([data-covers-tab-bar])_&]:hidden rounded-[2.125rem] border bg-card p-1.5 shadow-nav"
        >
          <ul className="flex gap-1">
            {destinations.map(({ href, label, icon: Icon }) => {
              const active = pathname === href
              return (
                // Tabs share the width equally but never shrink below their label, so
                // "Medications" stays whole at 320px.
                <li key={href} className="min-w-fit flex-1">
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
      )}
    </div>
  )
}
