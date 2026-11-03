import 'server-only'

import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

const lifetimeSeconds = 7 * 24 * 60 * 60
const allowedEmail = () => process.env.AUTH_ALLOWED_EMAIL?.trim().toLowerCase()
const sessionVersion = () => process.env.AUTH_SESSION_VERSION || '1'

export function authConfigured() {
  try {
    const url = new URL(process.env.AUTH_URL || '')
    return Boolean(
      (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')) &&
      url.pathname === '/' &&
      !url.username &&
      !url.password &&
      process.env.AUTH_SECRET &&
      process.env.AUTH_GOOGLE_ID &&
      process.env.AUTH_GOOGLE_SECRET &&
      allowedEmail(),
    )
  } catch {
    return false
  }
}

export const { handlers, auth } = NextAuth({
  providers: [
    Google({
      authorization: { params: { scope: 'openid email', prompt: 'select_account' } },
      checks: ['pkce', 'state'],
    }),
  ],
  session: { strategy: 'jwt', maxAge: lifetimeSeconds },
  pages: { signIn: '/', error: '/sign-in/error' },
  // Provider errors can contain credentials or personal information. Log only a generic event.
  logger: {
    error() {
      console.error('auth_failure')
    },
    warn() {
      console.warn('auth_warning')
    },
    debug() {},
  },
  callbacks: {
    signIn({ account, profile }) {
      return Boolean(
        authConfigured() &&
        account?.provider === 'google' &&
        profile?.email_verified === true &&
        profile.email?.toLowerCase() === allowedEmail() &&
        typeof profile.sub === 'string' &&
        profile.sub.length > 0,
      )
    },
    jwt({ token, account, profile }) {
      if (account) {
        if (account.provider !== 'google' || !profile?.sub) return null
        return {
          sub: `google:${profile.sub}`,
          email: profile.email?.toLowerCase(),
          deadline: Math.floor(Date.now() / 1000) + lifetimeSeconds,
          version: sessionVersion(),
        }
      }
      // Ignore client session updates. Authorization comes exclusively from signed claims.
      if (
        !authConfigured() ||
        token.email !== allowedEmail() ||
        token.version !== sessionVersion() ||
        typeof token.sub !== 'string' ||
        !/^google:.+/.test(token.sub) ||
        typeof token.deadline !== 'number' ||
        !Number.isFinite(token.deadline) ||
        Date.now() >= token.deadline * 1000
      )
        return null
      return token
    },
    session({ token }) {
      // Do not expose the email, Google profile or provider tokens to the browser.
      return {
        user: { id: token.sub! },
        expires: new Date(Number(token.deadline) * 1000).toISOString(),
      }
    },
  },
})

/** Authenticate inside each operation, then scope queries/writes to this ID. */
export async function requireUser(ownerId?: string) {
  const session = authConfigured() ? await auth() : null
  if (!session?.user?.id) throw new Error('Unauthorized')
  if (ownerId !== undefined && ownerId !== session.user.id) throw new Error('Forbidden')
  return { id: session.user.id, expires: session.expires }
}
