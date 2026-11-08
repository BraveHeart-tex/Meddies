import { cookies } from 'next/headers'
import { authConfigured } from '@/features/auth/server'
import { SignInScreen } from '@/features/auth/sign-in-screen'
import { callbackReturnTo } from '@/features/auth/return-to'

export default async function SignInErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const { error } = await searchParams
  const store = await cookies()
  // Auth.js retains this callback cookie when a provider refuses or the callback fails.
  const callback =
    store.get('__Secure-authjs.callback-url')?.value ?? store.get('authjs.callback-url')?.value
  return (
    <SignInScreen
      configured={authConfigured()}
      error={typeof error === 'string' ? error : 'Callback'}
      returnTo={callbackReturnTo(callback, process.env.AUTH_URL || 'http://localhost')}
    />
  )
}
