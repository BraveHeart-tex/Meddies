import { spawn } from 'node:child_process'
import { expect, test, vi } from 'vitest'
import { cleanupJourney, JourneyService } from './browser/journey-server'

test('startup exit includes stage, exit code and redacted stdout and stderr', async () => {
  const service = new JourneyService(['auth-secret', 'session-token', 'worker-secret'])
  service.start(() =>
    spawn(process.execPath, [
      '-e',
      `
    console.log('auth-secret session-token')
    console.error('EADDRINUSE worker-secret')
    process.exit(23)
  `,
    ]),
  )
  try {
    await expect(service.waitUntilReady('http://localhost:1', undefined, 1000)).rejects.toThrow(
      /readiness.*exit code=23/,
    )
    expect(service.log()).toMatch(/stage=readiness.*exit code=23/)
    expect(service.log()).toContain('[redacted] [redacted]')
    expect(service.log()).toContain('EADDRINUSE [redacted]')
    expect(service.log()).not.toMatch(/auth-secret|session-token|worker-secret/)
  } finally {
    await service.stop()
  }
})

test('signal termination interrupts a stalled readiness request', async () => {
  const service = new JourneyService([])
  service.start(() => spawn(process.execPath, ['-e', "process.kill(process.pid, 'SIGTERM')"]))
  vi.stubGlobal('fetch', () => new Promise(() => {}))
  try {
    await expect(service.waitUntilReady('http://localhost:1', undefined, 1000)).rejects.toThrow(
      /stage=readiness.*exit code=null, signal=SIGTERM/,
    )
  } finally {
    vi.unstubAllGlobals()
    await service.stop()
  }
})

test('asynchronous spawn failure is handled and reported without exposing credentials', async () => {
  const service = new JourneyService(['private-command'])
  service.start(() => spawn('/nonexistent/private-command'))
  try {
    await expect(service.waitUntilReady('http://localhost:1', undefined, 1000)).rejects.toThrow(
      /spawn error:.*\[redacted\].*ENOENT/,
    )
  } finally {
    await service.stop()
  }
})

test('synchronous spawn failure reports its stage and redacts its error', () => {
  const service = new JourneyService(['auth-secret'])
  expect(() =>
    service.start(() => {
      throw new Error('auth-secret invalid spawn')
    }),
  ).toThrow(/stage=spawn.*\[redacted\] invalid spawn/)
})

test.each(['request', 'body'])(
  'readiness budget bounds a stalled %s and aborts it',
  async (stage) => {
    vi.useFakeTimers()
    const service = new JourneyService([])
    service.addLog('Next.js listening')
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', (_url: string, options: RequestInit) => {
      signal = options.signal as AbortSignal
      if (stage === 'request') return new Promise(() => {})
      return Promise.resolve({ ok: true, status: 200, json: () => new Promise(() => {}) })
    })
    try {
      const result = service.waitUntilReady(
        'http://localhost:1',
        { cookie: 'token', ownerId: 'owner' },
        500,
      )
      const assertion = expect(result).rejects.toThrow(
        stage === 'request'
          ? /timeout after 500ms; last readiness: no response[\s\S]*Next.js listening/
          : /timeout after 500ms; last readiness: HTTP 200, reading session body[\s\S]*Next.js listening/,
      )
      await vi.advanceTimersByTimeAsync(500)
      await assertion
      expect(signal?.aborted).toBe(true)
    } finally {
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  },
)

test('readiness retains the last rejected response and accepts only the expected session', async () => {
  vi.useFakeTimers()
  const service = new JourneyService([])
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ id: 'someone-else' })))
  try {
    const assertion = expect(
      service.waitUntilReady('http://localhost:1', { cookie: 'token', ownerId: 'owner' }, 250),
    ).rejects.toThrow('last readiness: HTTP 200, unexpected session identity')
    await vi.advanceTimersByTimeAsync(250)
    await assertion
  } finally {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  }
})

test.each([undefined, { cookie: 'token', ownerId: 'owner' }])(
  'readiness preserves anonymous and authenticated success',
  async (session) => {
    const service = new JourneyService([])
    vi.stubGlobal('fetch', async () =>
      session ? new Response(JSON.stringify({ id: 'owner' })) : new Response(null, { status: 401 }),
    )
    try {
      await service.waitUntilReady('http://localhost:1', session, 500)
    } finally {
      vi.unstubAllGlobals()
    }
  },
)

test('cleanup releases all resources even when diagnostics and a release fail', async () => {
  const released: string[] = []
  await expect(
    cleanupJourney([
      async () => {
        throw new Error('attachment unavailable')
      },
      async () => {
        released.push('child')
        throw new Error('stop failed')
      },
      async () => {
        released.push('proxy')
      },
      async () => {
        released.push('worker')
      },
      async () => {
        released.push('clock')
      },
    ]),
  ).rejects.toThrow('Journey cleanup failed')
  expect(released).toEqual(['child', 'proxy', 'worker', 'clock'])
})

test('bounded logs redact secrets split across chunks and the retained tail boundary', () => {
  const service = new JourneyService(['session-token'])
  service.addLog('session-')
  service.addLog('token')
  expect(service.log()).toBe('[redacted]')
  service.addLog('x'.repeat(15_995))
  expect(service.log()).not.toContain('token')
  expect(service.log().length).toBeLessThanOrEqual(8000)
})

test('tail truncation cannot expose a partial token after repeated secrets are redacted', () => {
  const secret = 'private-session-token-with-long-value'
  const service = new JourneyService([secret])
  service.addLog(secret + secret.repeat(600))
  expect(service.log()).not.toMatch(/private|session|token|long-value/)
})

test('cleanup stops the real child even when retaining evidence fails', async () => {
  const service = new JourneyService([])
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
  service.start(() => child)
  await expect(
    cleanupJourney([
      async () => {
        throw new Error('attachment failed')
      },
      () => service.stop(),
    ]),
  ).rejects.toThrow('Journey cleanup failed')
  expect(child.signalCode).toBe('SIGTERM')
})
