import { authConfigured, handlers } from '@/features/auth/server'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

async function handle(request: NextRequest) {
  if (!authConfigured()) {
    return Response.json(
      { error: 'Sign-in is temporarily unavailable. Please try again later.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  const response = await handlers[request.method === 'POST' ? 'POST' : 'GET'](request)
  // Auth.js error redirects may have immutable headers. Copy before adding cache policy.
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export { handle as GET, handle as POST }
