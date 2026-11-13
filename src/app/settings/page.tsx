import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { auth, authConfigured } from '@/features/auth/server'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { schedulingNow } from '@/features/schedules/server'
import { holdRouteRender } from '@/lib/route-render-hold'
import { SettingsScreen } from './settings-screen'

export default async function SettingsPage() {
  // Session-dependent: never prerender, even when auth env is absent at build time.
  await connection()
  await holdRouteRender('settings')
  const configured = authConfigured()
  const session = configured ? await auth() : null
  if (!session?.user?.id) redirect(`/?returnTo=${encodeURIComponent('/settings')}`)
  return (
    <SessionBoundary ownerId={session.user.id} expires={session.expires}>
      <SettingsScreen expires={session.expires} now={schedulingNow().toISOString()} />
    </SessionBoundary>
  )
}
