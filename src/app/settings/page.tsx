import Link from 'next/link'
import { connection } from 'next/server'
import { AppShell } from '@/components/layout/app-shell'
import { AppHeader } from '@/components/layout/app-header'
import { AuthControl } from '@/features/auth/controls'
import { auth, authConfigured } from '@/features/auth/server'
import { SessionBoundary } from '@/features/auth/session-boundary'

export default async function SettingsPage() {
  // Session-dependent: never prerender, even when auth env is absent at build time.
  await connection()
  const configured = authConfigured()
  const session = configured ? await auth() : null
  if (!session?.user?.id)
    return (
      <main className="mx-auto max-w-lg space-y-4 px-6 py-12">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p>Sign in to view account settings.</p>
        <Link className="underline" href="/?returnTo=%2Fsettings">
          Sign in
        </Link>
      </main>
    )
  return (
    <SessionBoundary ownerId={session.user.id} expires={session.expires}>
      <AppShell>
        <section className="space-y-5">
          <AppHeader title="Settings" />
          <p className="text-muted-foreground">Private account access</p>
          <AuthControl signedIn />
          <Link className="underline" href="/">
            Back to Today
          </Link>
        </section>
      </AppShell>
    </SessionBoundary>
  )
}
