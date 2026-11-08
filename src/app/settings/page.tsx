import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { AppShell } from '@/components/layout/app-shell'
import { AppHeader } from '@/components/layout/app-header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { AuthControl } from '@/features/auth/controls'
import { auth, authConfigured } from '@/features/auth/server'
import { SessionBoundary } from '@/features/auth/session-boundary'

export default async function SettingsPage() {
  // Session-dependent: never prerender, even when auth env is absent at build time.
  await connection()
  const configured = authConfigured()
  const session = configured ? await auth() : null
  if (!session?.user?.id) redirect(`/?returnTo=${encodeURIComponent('/settings')}`)
  const deadline = new Date(session.expires)
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .format(deadline)
    .replace(',', '')
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(deadline)
  return (
    <SessionBoundary ownerId={session.user.id} expires={session.expires}>
      <AppShell>
        <section className="space-y-5">
          <AppHeader title="Settings" />
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Account</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-body-sm text-muted-foreground">
                Signed in with your approved Google account
              </p>
              <p className="text-body-sm">
                Session ends{' '}
                <time dateTime={session.expires}>
                  {day} at {time}
                </time>
              </p>
              <AuthControl signedIn />
              <p className="text-caption text-muted-foreground">
                Signs you out of Meddies in this browser. Your Google account and Meddies sessions
                on other devices stay signed in.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Time</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-body-sm text-muted-foreground">
              Times are Istanbul time, 24-hour, wherever your device is.
            </CardContent>
          </Card>
        </section>
      </AppShell>
    </SessionBoundary>
  )
}
