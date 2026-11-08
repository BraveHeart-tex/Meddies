'use client'

import { useEffect, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'
import { Info } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { safeReturnTo } from './return-to'

export function SignInScreen({
  configured,
  error,
  reason,
  returnTo = '/',
}: {
  configured: boolean
  error?: string
  reason?: string
  returnTo?: string
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const submitting = useRef(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [announce, setAnnounce] = useState(false)
  const info = configured && !error && !failed && ['expired', 'signed-out'].includes(reason ?? '')
  useEffect(() => {
    if (reason || error) heading.current?.focus()
    // Populate the live region after mount, once, without also describing the heading with it.
    const frame = requestAnimationFrame(() => setAnnounce(true))
    return () => cancelAnimationFrame(frame)
  }, [reason, error])
  const message = !configured
    ? ['Sign-in is unavailable right now.', 'Nothing in Meddies has changed. Try again later.']
    : failed
      ? ["Couldn't reach Google.", 'Check your connection and try again.']
      : error === 'AccessDenied'
        ? [
            "This Google account can't open Meddies.",
            'Meddies is private to one approved account. Choose that account to continue.',
          ]
        : error
          ? ["Sign-in with Google didn't finish.", 'Nothing in Meddies changed. Try again.']
          : reason === 'expired'
            ? ['Your session ended.', "Changes you hadn't saved were cleared."]
            : reason === 'signed-out'
              ? [
                  "You're signed out of Meddies in this browser.",
                  'Your Google account stays signed in.',
                ]
              : null

  async function submit() {
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    setFailed(false)
    try {
      if (!navigator.onLine) throw new Error('Offline')
      const result = await signIn('google', { redirect: false, redirectTo: safeReturnTo(returnTo) })
      if (!result?.ok || result.error || !result.url) throw new Error('Unavailable')
      // Remove sign-in from Back history before leaving for Google.
      window.location.replace(result.url)
    } catch {
      submitting.current = false
      setPending(false)
      setFailed(true)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-5 px-5 pt-[calc(1.75rem+env(safe-area-inset-top,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <p className="text-display font-black tracking-tight">Meddies</p>
      {message && (
        <Alert
          variant={!configured || info ? 'default' : 'destructive'}
          role={info ? 'status' : 'alert'}
          aria-atomic="true"
        >
          {info ? <Info size={16} aria-hidden="true" /> : <Icon name="warning" size={16} />}
          <AlertTitle aria-hidden={info || undefined}>{message[0]}</AlertTitle>
          <AlertDescription aria-hidden={info || undefined}>{message[1]}</AlertDescription>
          {info && <span className="sr-only">{announce ? `${message[0]} ${message[1]}` : ''}</span>}
        </Alert>
      )}
      <Card>
        <CardHeader className="gap-3">
          <CardTitle>
            <h1 ref={heading} tabIndex={-1}>
              Sign in
            </h1>
          </CardTitle>
          <CardDescription>Use your approved Google account to open your routine.</CardDescription>
        </CardHeader>
        <CardContent>
          {!configured ? (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          ) : (
            <Button
              size="lg"
              className="w-full whitespace-normal"
              disabled={pending}
              aria-busy={pending}
              onClick={submit}
            >
              {pending
                ? 'Opening Google…'
                : failed
                  ? 'Try again'
                  : error === 'AccessDenied'
                    ? 'Choose another Google account'
                    : error
                      ? 'Try again'
                      : 'Continue with Google'}
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
