import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & { id: string; givenName?: string }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    givenName?: string
  }
}
