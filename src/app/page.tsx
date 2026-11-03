import { auth, authConfigured } from '@/features/auth/server'
import { AuthControl } from '@/features/auth/controls'
import { SessionBoundary } from '@/features/auth/session-boundary'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>
}) {
  const configured = authConfigured()
  const session = configured ? await auth() : null
  const { error, reason } = await searchParams
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Meddies</h1>
      {session?.user?.id ? (
        <SessionBoundary expires={session.expires}>
          <div className="space-y-6">
            <h2 className="text-xl font-medium">Welcome back</h2>
            <p>You’re signed in privately. Your medication tools are being built.</p>
            <AuthControl signedIn />
          </div>
        </SessionBoundary>
      ) : (
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
          {configured && <AuthControl />}
        </>
      )}
    </main>
  )
}
