'use client'

import Link from 'next/link'
import { AppHeader } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <AppHeader title="Meddies" />
        <Alert variant="destructive">
          <Icon name="warning" />
          <AlertTitle>This page couldn&apos;t open.</AlertTitle>
          <AlertDescription>Your records haven&apos;t changed.</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
          <Link href="/" className={cn(buttonVariants({ variant: 'ghost' }))}>
            Open Today
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
