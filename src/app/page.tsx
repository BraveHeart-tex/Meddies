import { MedicinePanel } from '@/features/medicines/medicine-panel'
import { auth, authConfigured } from '@/features/auth/server'
import { AuthControl } from '@/features/auth/controls'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { AppShell } from '@/components/layout/app-shell'
import { schedulingNow } from '@/features/schedules/server'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[]
    reason?: string | string[]
    returnTo?: string | string[]
  }>
}) {
  const configured = authConfigured()
  const session = configured ? await auth() : null
  const { error, reason, returnTo } = await searchParams
  const safeReturnTo = (() => {
    if (typeof returnTo !== 'string' || /[\\\u0000-\u001f]/.test(returnTo)) return '/'
    if (['/', '/medications', '/medications?add', '/settings'].includes(returnTo)) return returnTo
    if (/^\/history(?:\?date=\d{4}-\d{2}-\d{2})?$/.test(returnTo)) return returnTo
    return /^\/medications\?(?:medicine|schedule)=[a-f0-9-]{36}$/i.test(returnTo) ? returnTo : '/'
  })()
  if (session?.user?.id) {
    return (
      <SessionBoundary ownerId={session.user.id} expires={session.expires}>
        <AppShell>
          <MedicinePanel scheduleMode="today" initialNow={schedulingNow().toISOString()} />
        </AppShell>
      </SessionBoundary>
    )
  }
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Meddies</h1>
      <>
        <div className="space-y-3">
          <h2 className="text-xl font-medium">Your routine, in your hands</h2>
          <p>Sign in with your approved Google account to enter Meddies.</p>
          <p className="text-sm text-muted-foreground">
            Meddies is private. Access is limited to the approved account.
          </p>
        </div>
        <p role="status">
          {!configured
            ? 'Sign-in is temporarily unavailable. Please try again later.'
            : error === 'AccessDenied'
              ? 'This account cannot access Meddies. Try your approved Google account.'
              : error
                ? 'Sign-in did not finish. Please try again.'
                : reason === 'expired'
                  ? 'Your session ended. Please sign in again.'
                  : reason === 'signed-out'
                    ? 'You’re signed out.'
                    : ''}
        </p>
        {configured && <AuthControl returnTo={safeReturnTo} />}
      </>
    </main>
  )
}
