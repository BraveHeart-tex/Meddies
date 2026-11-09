'use client'

import { TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { signOut } from 'next-auth/react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useKnownOffline } from '@/lib/use-known-offline'
import { Button } from '@/components/ui/button'
import { sessionSaves, type OutstandingSave } from '@/lib/session-saves'
import { endSession } from './session-end'
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

const savedNames = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })
const saveNouns = { medicine: 'medication', schedule: 'schedule', dose: 'dose' } as const

/** D18: names the affected saves. Never claims a save was cancelled or lost. */
function SaveWarning({ saves }: { saves: OutstandingSave[] }) {
  const names = saves.map((save) =>
    save.kind === 'schedule' ? `the schedule for ${save.label}` : save.label,
  )
  return (
    <Alert>
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>
        {saves.length === 1
          ? `A ${saveNouns[saves[0].kind]} save hasn't finished yet.`
          : "Some saves haven't finished yet."}
      </AlertTitle>
      <AlertDescription>
        If you sign out now, Meddies can&apos;t show whether {savedNames.format(names)}{' '}
        {saves.length === 1 ? 'was' : 'were'} recorded until you sign in again.
      </AlertDescription>
    </Alert>
  )
}

function SignOutControl() {
  const submitting = useRef(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [result, setResult] = useState<'active' | 'unknown' | null>(null)
  const offline = useKnownOffline()
  const store = sessionSaves(useQueryClient())
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const outstanding = store.outstanding()
  const [warned, setWarned] = useState(false)
  const warning = warned && outstanding.length > 0
  const stayButton = useRef<HTMLButtonElement>(null)
  const signOutButton = useRef<HTMLButtonElement>(null)
  const wasWarning = useRef(false)
  // The warning's buttons replace Sign out, so focus moves with them both ways.
  useEffect(() => {
    if (warning) stayButton.current?.focus()
    else if (wasWarning.current) signOutButton.current?.focus()
    wasWarning.current = warning
  }, [warning])

  function requestSignOut() {
    // A retry follows an earlier Sign out anyway, so the warning has already been answered.
    if (outstanding.length > 0 && !result) setWarned(true)
    else void submit()
  }

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
          endSession('signed-out')
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
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            {offline
              ? "You're offline. Connect to the internet to sign out."
              : result === 'active'
                ? "You're still signed in to Meddies in this browser. Try signing out again."
                : "Couldn't check whether you're signed out. Check your connection and try again."}
          </AlertDescription>
        </Alert>
      )}
      {warning ? (
        <>
          <SaveWarning saves={outstanding} />
          <Button
            ref={stayButton}
            type="button"
            size="lg"
            className="w-full"
            onClick={() => setWarned(false)}
          >
            Stay signed in
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full"
            onClick={() => {
              setWarned(false)
              void submit()
            }}
          >
            Sign out anyway
          </Button>
        </>
      ) : (
        <Button
          type="button"
          ref={signOutButton}
          onClick={requestSignOut}
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
      )}
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
