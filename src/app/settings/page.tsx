import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { AuthControl } from '@/features/auth/controls'
import { auth, authConfigured } from '@/features/auth/server'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { schedulingNow } from '@/features/schedules/server'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { holdRouteRender } from '@/lib/route-render-hold'
import { SettingsFrame } from './settings-frame'

export default async function SettingsPage() {
  // Session-dependent: never prerender, even when auth env is absent at build time.
  await connection()
  await holdRouteRender('settings')
  const configured = authConfigured()
  const session = configured ? await auth() : null
  if (!session?.user?.id) redirect(`/?returnTo=${encodeURIComponent('/settings')}`)
  const today = schedulingNow().toISOString()
  return (
    <SessionBoundary ownerId={session.user.id} expires={session.expires}>
      <SettingsFrame>
        <p className="text-body-sm text-muted-foreground">
          Signed in with your approved Google account
        </p>
        <p className="text-body-sm">
          Session ends{' '}
          <time dateTime={session.expires}>
            {formatShortDay(session.expires, today)} at {formatTime(session.expires)}
          </time>
        </p>
        <AuthControl signedIn />
        <p className="text-caption text-muted-foreground">
          Signs you out of Meddies in this browser. Your Google account and Meddies sessions on
          other devices stay signed in.
        </p>
      </SettingsFrame>
    </SessionBoundary>
  )
}
