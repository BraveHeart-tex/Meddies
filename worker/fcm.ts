// The FCM reminder provider (#368, docs/product/reminders.md #30 and #37): implements the
// due-reminder provider port by sending one reminder to one Device registration through FCM HTTP v1
// (`projects/{id}/messages:send`). Its OAuth2 access token comes from a service-account JWT
// signed with WebCrypto; `firebase-admin` is Node-only and the legacy server key is never used.
// One provider holds its token until five minutes before expiry and concurrent submissions share
// one token request, so the caller keeps one provider per Worker isolate.
//
// The message carries the generic wording (docs/copy.md Reminder wording): an Original reminder's,
// or a Follow-up reminder's naming the due time (#31), with the dose count when it covers several
// doses, and its Reminder link as `data.link` for the service worker's tap handler: the
// Occurrence's for one dose, the grouped one for several (#372). Its Web Push TTL ends with the
// Occurrence's +80 minute window, or a Snooze's (#36) target +5 minutes when later. Only a message
// with `labels`, which the due-reminder operation adds with Medication names on (#37), uses the
// named wording: one dose's label in its title, several doses' labels in their body, with the
// generic body or title beside it. A label appears in nothing else.
//
// Answers: success is accepted; 429, 5xx, an expired access token, a token-endpoint failure, a
// network error or a timeout is transient; anything else is rejected with FCM's `errorCode`, or
// its status. Nothing here logs, so no token, credential or provider message text leaves it.
import { reminderDueLink, reminderLink } from '../src/features/schedules/reminder-link'
import { formatTime } from '../src/lib/calendar-date'
import {
  REMINDER_WINDOW_MS,
  SNOOZE_LATENESS_MS,
  type ProviderAnswer,
  type ReminderMessage,
  type ReminderProvider,
} from './due-reminders'

/** The `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL` and `FCM_PRIVATE_KEY` Worker secrets. */
export type FcmCredentials = { projectId: string; clientEmail: string; privateKey: string }

type Options = { fetch?: typeof fetch; clock?: () => Date; timeoutMs?: number }

export const reminderTitle = 'Time for your dose'
export const reminderBody = "Open Meddies when you're ready to log it."
export const groupedReminderTitle = (count: number) => `Time for ${count} doses`
export const groupedReminderBody = "Open Meddies when you're ready to log them."
export const followUpTitle = (time: string) => `Your ${time} dose`
export const followUpBody = "Not logged yet. Open Meddies when you're ready to log it."
export const groupedFollowUpTitle = (time: string) => `Your ${time} doses`
export const groupedFollowUpBody = (count: number) =>
  `${count} doses not logged yet. Open Meddies when you're ready to log them.`
export const namedReminderTitle = (name: string) => `Time for ${name}`
export const namedGroupedReminderBody = (names: string) =>
  `${names}. Open Meddies when you're ready to log them.`
export const namedFollowUpTitle = (time: string, name: string) => `Your ${time} dose: ${name}`
export const namedGroupedFollowUpBody = (names: string) =>
  `${names} not logged yet. Open Meddies when you're ready to log them.`

export const fcmTokenUrl = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const TOKEN_LIFETIME_S = 3600
const REFRESH_MARGIN_MS = 5 * 60_000
const TIMEOUT_MS = 10_000

export function createFcmProvider(
  credentials: FcmCredentials,
  { fetch: send = fetch, clock = () => new Date(), timeoutMs = TIMEOUT_MS }: Options = {},
): ReminderProvider {
  const sendUrl = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.projectId)}/messages:send`
  let key: Promise<CryptoKey> | undefined
  let cached: { value: string; refreshAt: number } | undefined
  let pending: Promise<string> | undefined

  const accessToken = () => {
    if (cached && clock().getTime() < cached.refreshAt) return Promise.resolve(cached.value)
    pending ??= requestToken().finally(() => (pending = undefined))
    return pending
  }

  async function requestToken() {
    const issuedAt = clock().getTime()
    key ??= importPrivateKey(credentials.privateKey)
    const iat = Math.floor(issuedAt / 1000)
    const assertion = await signJwt(await key, {
      iss: credentials.clientEmail,
      scope: SCOPE,
      aud: fcmTokenUrl,
      iat,
      exp: iat + TOKEN_LIFETIME_S,
    })
    const response = await send(fcmTokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const body = response.ok ? ((await response.json()) as Record<string, unknown>) : {}
    if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number')
      throw new Error('FCM access token unavailable')
    cached = {
      value: body.access_token,
      refreshAt: issuedAt + body.expires_in * 1000 - REFRESH_MARGIN_MS,
    }
    return cached.value
  }

  return {
    async submit(message: ReminderMessage): Promise<ProviderAnswer> {
      try {
        const token = await accessToken()
        const response = await send(sendUrl, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(fcmMessage(message, clock())),
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (response.ok) return { outcome: 'accepted' }
        const code = await errorCode(response)
        if (code === 'UNAUTHENTICATED') cached = undefined
        const transient = response.status === 429 || response.status >= 500
        return {
          outcome: transient || code === 'UNAUTHENTICATED' ? 'transient' : 'rejected',
          code,
        }
      } catch (error) {
        const timeout = (error as { name?: unknown } | null)?.name === 'TimeoutError'
        return { outcome: 'transient', code: timeout ? 'TIMEOUT' : 'UNAVAILABLE' }
      }
    },
  }
}

/** The FCM HTTP v1 request body for one reminder. */
export function fcmMessage(message: ReminderMessage, now: Date) {
  // A Snooze stays eligible through its target +5 minutes, past due +80 for an extension.
  const windowEnd = Math.max(
    Date.parse(message.dueAt) + REMINDER_WINDOW_MS,
    message.snoozedTo ? Date.parse(message.snoozedTo) + SNOOZE_LATENESS_MS : 0,
  )
  const ttl = Math.max(0, Math.floor((windowEnd - now.getTime()) / 1000))
  const [scheduleId, ...others] = message.scheduleIds
  const count = message.scheduleIds.length
  return {
    message: {
      token: message.token,
      notification: notification(
        message.reminder,
        formatTime(message.dueAt),
        count,
        message.labels,
      ),
      data: {
        link: others.length
          ? reminderDueLink(message.dueAt)
          : reminderLink({ scheduleId, dueAt: message.dueAt }),
      },
      webpush: { headers: { Urgency: 'high', TTL: String(ttl) } },
    },
  }
}

function notification(
  reminder: ReminderMessage['reminder'],
  time: string,
  count: number,
  labels: string[] | undefined,
) {
  if (labels?.length) {
    const names = listNames(labels)
    if (reminder)
      return count > 1
        ? { title: groupedFollowUpTitle(time), body: namedGroupedFollowUpBody(names) }
        : { title: namedFollowUpTitle(time, names), body: followUpBody }
    return count > 1
      ? { title: groupedReminderTitle(count), body: namedGroupedReminderBody(names) }
      : { title: namedReminderTitle(names), body: reminderBody }
  }
  if (reminder)
    return count > 1
      ? { title: groupedFollowUpTitle(time), body: groupedFollowUpBody(count) }
      : { title: followUpTitle(time), body: followUpBody }
  return count > 1
    ? { title: groupedReminderTitle(count), body: groupedReminderBody }
    : { title: reminderTitle, body: reminderBody }
}

// "Aspirin", "Aspirin and Metformin", "Aspirin, Metformin and Vitamin D" (docs/copy.md).
function listNames(labels: string[]) {
  return labels.length > 1
    ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
    : labels[0]
}

// FCM puts its specific code, such as UNREGISTERED, in an FcmError detail; the status, such as
// NOT_FOUND, otherwise.
async function errorCode(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: { status?: unknown; details?: { errorCode?: unknown }[] }
  } | null
  const detail = body?.error?.details?.find((item) => typeof item?.errorCode === 'string')
  if (typeof detail?.errorCode === 'string') return detail.errorCode
  return typeof body?.error?.status === 'string' ? body.error.status : `HTTP_${response.status}`
}

// The private key arrives as PEM, with `\n` escapes when stored as one line.
function importPrivateKey(pem: string) {
  const base64 = pem
    .replaceAll('\\n', '\n')
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  return crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

async function signJwt(key: CryptoKey, claims: Record<string, unknown>) {
  const encode = (value: object) => base64Url(new TextEncoder().encode(JSON.stringify(value)))
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}`
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  )
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}
