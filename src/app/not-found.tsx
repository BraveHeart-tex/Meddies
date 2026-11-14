import Link from 'next/link'
import { Info } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { RecoveryShell } from '@/features/auth/recovery-shell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function NotFound() {
  return (
    <RecoveryShell>
      <div className="flex flex-col gap-5">
        <AppHeader title="Page not found" />
        <Alert>
          <Info aria-hidden="true" />
          <AlertTitle>This page isn&apos;t in Meddies.</AlertTitle>
          <AlertDescription>
            The link may be old or mistyped. Your records haven&apos;t changed.
          </AlertDescription>
        </Alert>
        <Link href="/" className={cn(buttonVariants({ variant: 'outline' }))}>
          Open Today
        </Link>
      </div>
    </RecoveryShell>
  )
}
