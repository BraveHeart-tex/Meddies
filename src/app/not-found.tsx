import Link from 'next/link'
import { AppHeader } from '@/components/layout/app-header'
import { RecoveryShell } from '@/features/auth/recovery-shell'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function NotFound() {
  return (
    <RecoveryShell>
      <div className="flex flex-col gap-5">
        <AppHeader title="Page not found" />
        <Link href="/" className={cn(buttonVariants({ variant: 'outline' }))}>
          Open Today
        </Link>
      </div>
    </RecoveryShell>
  )
}
