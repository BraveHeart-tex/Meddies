import { ApplicationError } from './application-error'

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export function failure(error: unknown, event: string) {
  if (error instanceof ApplicationError) return json({ error: error.code }, error.status)
  console.error(event)
  return json({ error: 'unavailable' }, 503)
}

export function mutationGuard(request: Request): Response | undefined {
  // Cookie-authenticated mutations require an exact same-origin browser request.
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return json({ error: 'forbidden' }, 403)
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    return json({ error: 'validation' }, 415)
}
