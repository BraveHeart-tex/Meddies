'use client'

import { useRef, useState } from 'react'
import { signOut } from 'next-auth/react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useKnownOffline } from '@/lib/use-known-offline'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { endSessionQueryClient } from '@/lib/session-query-client'
import { SignInScreen } from './sign-in-screen'

export function AuthControl({
  signedIn = false,
  returnTo = '/',
}: {
  signedIn?: boolean
  returnTo?: string
}) {
  return signedIn ? <SignOutControl /> : <SignInScreen configured returnTo={returnTo} />
}

function SignOutControl() {
  const submitting = useRef(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [result, setResult] = useState<'active' | 'unknown' | null>(null)
  const offline = useKnownOffline()

  async function submit() {
    if (submitting.current || !navigator.onLine) return
    submitting.current = true
    setPending(true)
    setFailed(false)
    setResult(null)
    try {
      // Even a lost POST response can have ended the session. Always check independently.
      try {
        await signOut({ redirect: false })
      } catch {
        // Only the no-store session read can establish the result.
      }
      try {
        const response = await fetch('/api/session', { cache: 'no-store' })
        if (response.status === 401) {
          endSessionQueryClient()
          window.location.replace('/?reason=signed-out')
          return
        }
        const session = response.ok ? await response.json() : null
        setResult(
          typeof session?.id === 'string' &&
            session.id.length > 0 &&
            typeof session?.expires === 'string' &&
            Number.isFinite(Date.parse(session.expires))
            ? 'active'
            : 'unknown',
        )
      } catch {
        setResult('unknown')
      }
      submitting.current = false
      setPending(false)
    } catch {
      setFailed(true)
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      {(offline || result) && (
        <Alert variant={offline ? 'default' : 'destructive'}>
          <Icon name="warning" size={16} />
          <AlertDescription>
            {offline
              ? "You're offline. Connect to the internet to sign out."
              : result === 'active'
                ? "You're still signed in to Meddies in this browser. Try signing out again."
                : "Couldn't check whether you're signed out. Check your connection and try again."}
          </AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        onClick={submit}
        disabled={pending || offline}
        variant="outline"
        size="lg"
        className="w-full"
      >
        {pending
          ? 'Signing out…'
          : offline
            ? 'Connect to sign out'
            : result
              ? 'Try signing out again'
              : 'Sign out'}
      </Button>
      <p role="status" className="text-sm" aria-live="polite">
        {failed
          ? 'Something went wrong. Check your connection and try again.'
          : pending
            ? 'Signing out…'
            : ''}
      </p>
    </div>
  )
}
