'use client'

import { useRef, useState } from 'react'
import { signIn, signOut } from 'next-auth/react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useKnownOffline } from '@/lib/use-known-offline'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { endSessionQueryClient } from '@/lib/session-query-client'

export function AuthControl({
  signedIn = false,
  returnTo = '/',
}: {
  signedIn?: boolean
  returnTo?: string
}) {
  const submitting = useRef(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [result, setResult] = useState<'active' | 'unknown' | null>(null)
  const offline = useKnownOffline()

  async function submit() {
    if (submitting.current || (signedIn && !navigator.onLine)) return
    submitting.current = true
    setPending(true)
    setFailed(false)
    setResult(null)
    try {
      if (signedIn) {
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
      } else {
        const localTarget = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
        const result = await signIn('google', { redirect: false, redirectTo: localTarget })
        if (!result?.ok || result.error || !result.url) throw new Error('Sign-in not available')
        window.location.assign(result.url)
      }
    } catch {
      setFailed(true)
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      {signedIn && (offline || result) && (
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
        disabled={pending || (signedIn && offline)}
        variant={signedIn ? 'outline' : 'default'}
        size={signedIn ? 'lg' : 'default'}
        className={signedIn ? 'w-full' : 'min-h-11 px-5'}
      >
        {pending
          ? signedIn
            ? 'Signing out…'
            : 'Connecting to Google…'
          : signedIn
            ? offline
              ? 'Connect to sign out'
              : result
                ? 'Try signing out again'
                : 'Sign out'
            : 'Continue with Google'}
      </Button>
      <p role="status" className="text-sm" aria-live="polite">
        {failed
          ? 'Something went wrong. Check your connection and try again.'
          : pending
            ? signedIn
              ? 'Signing out…'
              : 'Connecting to Google…'
            : ''}
      </p>
    </div>
  )
}
