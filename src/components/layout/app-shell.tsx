'use client'

import { CircleDot, List, Pill, Settings2, type LucideIcon } from 'lucide-react'
import { MotionConfig, motion } from 'motion/react'
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

// Pages and loading fallbacks render separate shells; the shared layoutId lets the outgoing pill hand
// its painted box to the next one, so it slides, and a tap mid-slide retargets from where it is.
const pillTransition = { duration: 0.25, ease: [0.2, 0.8, 0.2, 1] } as const // ease-calm

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
        <MotionConfig reducedMotion="user">
          <nav
            aria-label="Primary"
            // Display none so a full-screen modal also takes the tabs out of the focus order.
            className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom,0px))] z-10 mx-auto max-w-2xl [body:has([data-covers-tab-bar])_&]:hidden rounded-[2.125rem] border bg-card p-1.5 shadow-nav"
          >
            <ul className="flex flex-wrap gap-1">
              {destinations.map(({ href, label, icon: Icon }) => {
                const active = pathname === href
                return (
                  // Tabs share the width equally but never shrink below their label, so
                  // "Medications" never truncates; enlarged text can wrap whole tabs.
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
                        'control-link relative isolate flex min-h-14 flex-col items-center justify-center gap-1 rounded-full px-1 [&>svg]:size-5 text-center text-micro [overflow-wrap:anywhere] transition-colors duration-220 ease-calm motion-reduce:transition-none',
                        active
                          ? 'font-extrabold text-accent-foreground'
                          : 'font-bold text-muted-foreground',
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="active-tab-pill"
                          transition={pillTransition}
                          aria-hidden="true"
                          className="absolute inset-0 -z-10 bg-accent"
                          // Set inline so Motion corrects the radius while the pill scales.
                          style={{ borderRadius: 9999 }}
                        />
                      )}
                      <Icon aria-hidden="true" />
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </MotionConfig>
      )}
    </div>
  )
}
