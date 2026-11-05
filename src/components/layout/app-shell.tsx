'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const destinations = [
  { href: '/', label: 'Today' },
  { href: '/medications', label: 'Medications' },
  { href: '/history', label: 'History' },
]

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-[calc(1.5rem+env(safe-area-inset-top,0px))] sm:px-6">
      <header className="mb-8 flex items-center justify-between gap-3">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Meddies
        </Link>
        <Link
          href="/settings"
          aria-current={pathname === '/settings' ? 'page' : undefined}
          className="min-h-11 rounded-full border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Settings
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 px-3 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur"
      >
        <ul className="mx-auto grid max-w-2xl grid-cols-3 gap-2 py-2">
          {destinations.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 items-center justify-center rounded-xl px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}`}
                >
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
