import 'server-only'
import { ApplicationError } from '@/lib/application-error'

export async function sendStorage(
  path:
    | '/medicines'
    | '/medicine-type-correction'
    | '/schedules'
    | '/device-registrations'
    | '/quiet-hours'
    | '/medication-names'
    | '/snoozes'
    | '/dose-history',
  command: unknown,
): Promise<unknown> {
  const secret = process.env.MEDICINES_WORKER_SECRET
  const configuredUrl = process.env.MEDICINES_WORKER_URL
  if (!secret || !configuredUrl) throw new ApplicationError('unavailable', 503)
  let cause: 'configuration' | 'network' | 'http' | 'response' | 'timeout' = 'configuration'
  let status: number | null = null
  try {
    const url = new URL(configuredUrl)
    const local = ['localhost', '127.0.0.1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
      throw new Error('configuration')
    const headers: Record<string, string> = {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    }
    // Access authenticates the server; the existing bearer still guards Worker commands.
    // Local workerd needs neither token, and must never receive inherited credentials.
    if (!local) {
      const id = process.env.WORKER_ACCESS_CLIENT_ID
      const accessSecret = process.env.WORKER_ACCESS_CLIENT_SECRET
      if (
        (process.env.VERCEL_ENV === 'production' && (!id || !accessSecret)) ||
        Boolean(id) !== Boolean(accessSecret)
      )
        throw new Error('configuration')
      if (id && accessSecret) {
        headers['CF-Access-Client-Id'] = id
        headers['CF-Access-Client-Secret'] = accessSecret
      }
    }
    cause = 'network'
    const response = await fetch(new URL(path, url), {
      method: 'POST',
      headers,
      body: JSON.stringify(command),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    })
    if (response.status === 409) throw new ApplicationError('conflict', 409)
    if (response.status === 400) throw new ApplicationError('validation', 400)
    if (response.status === 404) throw new ApplicationError('not_found', 404)
    if (!response.ok) {
      cause = 'http'
      status = response.status
      throw new Error('storage')
    }
    cause = 'response'
    return await response.json()
  } catch (error) {
    if (error instanceof ApplicationError) throw error
    if (
      (cause === 'network' || cause === 'response') &&
      error instanceof Error &&
      error.name === 'TimeoutError'
    )
      cause = 'timeout'
    console.error({ kind: 'medicine_gateway_failure', cause, status })
    throw new ApplicationError('unavailable', 503)
  }
}
