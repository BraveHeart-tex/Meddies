import assert from 'node:assert/strict'
import { test } from 'vitest'
import { reminderLink } from '../src/features/schedules/reminder-link'
import type { ReminderMessage } from '../worker/due-reminders'
import { createFcmProvider, fcmTokenUrl } from '../worker/fcm'

// The FCM provider against a fake token endpoint and a fake FCM (#368).

const keys = await crypto.subtle.generateKey(
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify'],
)
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString(
  'base64',
)
// As stored in worker/.dev.vars: one line with `\n` escapes.
const privateKey = `-----BEGIN PRIVATE KEY-----\\n${pkcs8.match(/.{1,64}/g)!.join('\\n')}\\n-----END PRIVATE KEY-----\\n`
const credentials = {
  projectId: 'meddies-dev',
  clientEmail: 'sender@meddies-dev.iam.gserviceaccount.com',
  privateKey,
}
const sendUrl = 'https://fcm.googleapis.com/v1/projects/meddies-dev/messages:send'

const message: ReminderMessage = {
  token: 'registration-token',
  scheduleId: '6f1d2c4e-8a9b-4c3d-9e2f-1a2b3c4d5e6f',
  dueAt: '2026-11-17T06:00:00.000Z',
}

type Sent = { url: string; init: RequestInit }
type Reply = (sent: Sent) => Response | Promise<Response>

/** A fake network: the token endpoint issues `access-<n>`, FCM answers with `reply`. */
function fakeNetwork(reply: Reply = () => Response.json({ name: 'projects/x/messages/1' })) {
  const sent: Sent[] = []
  let issued = 0
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const entry = { url: String(input), init }
    sent.push(entry)
    if (entry.url === fcmTokenUrl)
      return Response.json({ access_token: `access-${++issued}`, expires_in: 3600 })
    return reply(entry)
  }) as typeof globalThis.fetch
  const tokenRequests = () => sent.filter((entry) => entry.url === fcmTokenUrl)
  const sends = () => sent.filter((entry) => entry.url === sendUrl)
  return { fetch, tokenRequests, sends }
}

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString())
const fcmError = (status: number, code: string, errorCode?: string) =>
  Response.json(
    {
      error: {
        code: status,
        message: `echo ${message.token}`,
        status: code,
        details: errorCode
          ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }]
          : [],
      },
    },
    { status },
  )

test('Submissions use an access token from a WebCrypto-signed JWT, reused until it nears expiry', async () => {
  let now = new Date('2026-11-17T06:00:00.000Z')
  const network = fakeNetwork()
  const provider = createFcmProvider(credentials, { fetch: network.fetch, clock: () => now })

  const answers = await Promise.all([1, 2, 3].map(() => provider.submit(message)))
  assert.deepEqual(answers, Array(3).fill({ outcome: 'accepted' }))
  assert.equal(network.tokenRequests().length, 1, 'concurrent submissions share one token request')

  const body = network.tokenRequests()[0].init.body as URLSearchParams
  assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer')
  const [header, claims, signature] = body.get('assertion')!.split('.')
  assert.deepEqual(decode(header), { alg: 'RS256', typ: 'JWT' })
  assert.deepEqual(decode(claims), {
    iss: credentials.clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now.getTime() / 1000,
    exp: now.getTime() / 1000 + 3600,
  })
  assert.ok(
    await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      keys.publicKey,
      Buffer.from(signature, 'base64url'),
      new TextEncoder().encode(`${header}.${claims}`),
    ),
    'the JWT verifies with the service account public key',
  )

  now = new Date('2026-11-17T06:54:59.000Z')
  await provider.submit(message)
  assert.equal(network.tokenRequests().length, 1, 'the token is reused before it nears expiry')

  now = new Date('2026-11-17T06:55:00.000Z')
  await provider.submit(message)
  assert.equal(network.tokenRequests().length, 2, 'a token five minutes from expiry is replaced')
  assert.deepEqual(
    network.sends().map((entry) => (entry.init.headers as Record<string, string>).authorization),
    [...Array(4).fill('Bearer access-1'), 'Bearer access-2'],
  )
})

test('The message carries the generic wording and the Reminder link, with no medication name', async () => {
  const network = fakeNetwork()
  const provider = createFcmProvider(credentials, {
    fetch: network.fetch,
    clock: () => new Date('2026-11-17T06:20:00.000Z'),
  })
  await provider.submit(message)

  assert.deepEqual(JSON.parse(network.sends()[0].init.body as string), {
    message: {
      token: 'registration-token',
      notification: {
        title: 'Time for your dose',
        body: "Open Meddies when you're ready to log it.",
      },
      data: { link: reminderLink(message) },
      // The push expires with the +80 minute window: 60 minutes remain.
      webpush: { headers: { Urgency: 'high', TTL: '3600' } },
    },
  })
})

test('A transient FCM error or timeout answers retryable; other errors are rejected with their code', async () => {
  const replies: Record<string, Reply> = {
    unavailable: () => fcmError(503, 'UNAVAILABLE', 'UNAVAILABLE'),
    quota: () => fcmError(429, 'RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED'),
    internal: () => new Response('<html>', { status: 500 }),
    timeout: ({ init }) =>
      new Promise((_, reject) =>
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason)),
      ),
    unregistered: () => fcmError(404, 'NOT_FOUND', 'UNREGISTERED'),
    notFound: () => fcmError(404, 'NOT_FOUND'),
    invalid: () => fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT'),
  }
  const answers: Record<string, unknown> = {}
  for (const [name, reply] of Object.entries(replies)) {
    const network = fakeNetwork(reply)
    answers[name] = await createFcmProvider(credentials, {
      fetch: network.fetch,
      timeoutMs: 20,
    }).submit(message)
  }
  assert.deepEqual(answers, {
    unavailable: { outcome: 'transient', code: 'UNAVAILABLE' },
    quota: { outcome: 'transient', code: 'QUOTA_EXCEEDED' },
    internal: { outcome: 'transient', code: 'HTTP_500' },
    timeout: { outcome: 'transient', code: 'TIMEOUT' },
    unregistered: { outcome: 'rejected', code: 'UNREGISTERED' },
    notFound: { outcome: 'rejected', code: 'NOT_FOUND' },
    invalid: { outcome: 'rejected', code: 'INVALID_ARGUMENT' },
  })
})

test('A failing token endpoint or a rejected access token answers retryable and gets a new token', async () => {
  const down = createFcmProvider(credentials, {
    fetch: (async () => new Response('', { status: 503 })) as typeof fetch,
  })
  assert.deepEqual(await down.submit(message), { outcome: 'transient', code: 'UNAVAILABLE' })

  let expired = true
  const network = fakeNetwork(() => {
    if (!expired) return Response.json({ name: 'projects/x/messages/1' })
    expired = false
    return fcmError(401, 'UNAUTHENTICATED')
  })
  const provider = createFcmProvider(credentials, { fetch: network.fetch })
  assert.deepEqual(await provider.submit(message), {
    outcome: 'transient',
    code: 'UNAUTHENTICATED',
  })
  assert.deepEqual(await provider.submit(message), { outcome: 'accepted' })
  assert.equal(network.tokenRequests().length, 2)
})
