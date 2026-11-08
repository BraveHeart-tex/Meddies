import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { AuthControl } from '@/features/auth/controls'
import { auth, authConfigured } from '@/features/auth/server'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { holdRouteRender } from '@/lib/route-render-hold'
import { SettingsFrame } from './settings-frame'

export default async function SettingsPage() {
  // Session-dependent: never prerender, even when auth env is absent at build time.
  await connection()
  await holdRouteRender('settings')
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
      <SettingsFrame>
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
          Signs you out of Meddies in this browser. Your Google account and Meddies sessions on
          other devices stay signed in.
        </p>
      </SettingsFrame>
    </SessionBoundary>
  )
}
