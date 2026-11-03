'use client'

import { useState } from 'react'
import { signIn, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export function AuthControl({ signedIn = false }: { signedIn?: boolean }) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit() {
    if (pending) return
    setPending(true)
    setFailed(false)
    try {
      if (signedIn) {
        await signOut({ redirect: false })
        const response = await fetch('/api/session', { cache: 'no-store' })
        if (response.status !== 401) throw new Error('Sign-out not confirmed')
        window.location.replace('/?reason=signed-out')
      } else {
        const result = await signIn('google', { redirect: false, redirectTo: '/' })
        if (!result?.ok || result.error || !result.url) throw new Error('Sign-in not available')
        window.location.assign(result.url)
      }
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" onClick={submit} disabled={pending} className="min-h-11 px-5">
        {pending
          ? signedIn
            ? 'Signing out…'
            : 'Connecting to Google…'
          : signedIn
            ? 'Sign out'
            : 'Continue with Google'}
      </Button>
      <p role="status" className="text-sm" aria-live="polite">
        {failed
          ? 'Something went wrong. Check your connection and try again.'
          : pending
            ? 'Please wait.'
            : ''}
      </p>
    </div>
  )
}
