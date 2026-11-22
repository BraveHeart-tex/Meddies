'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, ChevronLeft } from 'lucide-react'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { buttonVariants } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { TypeTile } from '@/features/medicines/type-tile'
import { cn } from '@/lib/utils'
import { correctionMedicine } from './type-correction-model'

export function Frame({
  title,
  children,
  medicine = correctionMedicine,
}: {
  title: string
  children: ReactNode
  medicine?: Medicine
}) {
  return (
    <AppShell current="/medications">
      <ScreenStack>
        <Link
          className={cn(buttonVariants({ variant: 'ghost' }), '-ml-3 self-start')}
          href="/lab/238-a3"
        >
          <ChevronLeft data-icon="inline-start" aria-hidden="true" />
          Magnesium
        </Link>
        <MedicationIdentity medicine={medicine} />
        <h2 className="text-heading">{title}</h2>
        {children}
      </ScreenStack>
    </AppShell>
  )
}

export function Nav({
  href,
  children,
  primary = false,
}: {
  href: string
  children: ReactNode
  primary?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({
          variant: primary ? 'default' : 'outline',
          size: primary ? 'lg' : 'default',
        }),
        'w-full',
      )}
    >
      {children}
    </Link>
  )
}

export function TypeChange() {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-body-lg font-extrabold">
      <span className="inline-flex items-center gap-2">
        <TypeTile type="tablet" />
        Tablet
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">to</span>
      <span className="inline-flex items-center gap-2">
        <TypeTile type="capsule" />
        Capsule
      </span>
    </span>
  )
}
