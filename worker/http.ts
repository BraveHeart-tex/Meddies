import { ApplicationError } from '../src/lib/application-error'
export { readJsonRequest } from '../src/lib/json-request'

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function authenticateService(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 32) throw new ApplicationError('unavailable', 503)
  // Fixed-length digests avoid an early-return comparison of secret strings.
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  const [actual, expected] = await Promise.all([
    digest(request.headers.get('authorization') || ''),
    digest(`Bearer ${secret}`),
  ])
  let mismatch = 0
  for (let i = 0; i < actual.length; i++) mismatch |= actual[i] ^ expected[i]
  if (mismatch) throw new ApplicationError('unauthorized', 401)
}

const commandPaths = [
  '/medicines',
  '/schedules',
  '/device-registrations',
  '/quiet-hours',
  '/medication-names',
] as const
export type CommandPath = (typeof commandPaths)[number]

export function commandPath(request: Request): CommandPath | Response {
  const path = new URL(request.url).pathname
  const known = commandPaths.find((candidate) => candidate === path)
  if (request.method !== 'POST' || !known) return json({ error: 'not_found' }, 404)
  return known
}

/** The scheduler command: `POST /due-reminders`, outside the owner-scoped commands. */
export const isSchedulerRequest = (request: Request) =>
  request.method === 'POST' && new URL(request.url).pathname === '/due-reminders'

export function failure(error: unknown) {
  if (error instanceof ApplicationError) return json({ error: error.code }, error.status)
  console.error('medicine_storage_failure')
  return json({ error: 'unavailable' }, 503)
}
