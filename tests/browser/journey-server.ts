import type { ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

// Next.js answers within tens of milliseconds of listening, so a short poll gap trims startup.
const READINESS_POLL_MS = 10

/** Per-journey service evidence, shared by inline errors and attachments. */
export class JourneyService {
  private child?: ChildProcess
  private output = ''
  private reason?: string
  private failureStage = 'readiness'
  private startupFailure = ''
  private closed: Promise<void> = Promise.resolve()
  private terminated: Promise<void>
  private onTermination!: () => void

  constructor(private readonly secrets: string[]) {
    this.terminated = new Promise((done) => (this.onTermination = done))
  }

  addLog = (value: Buffer | string) => {
    // Keep raw tails until rendering so a secret split across chunks is still redacted.
    const combined = this.output + value.toString()
    let start = Math.max(0, combined.length - 16_000)
    // Never retain only the suffix of a secret cut by the raw-tail boundary.
    for (const secret of this.secrets.filter(Boolean)) {
      const index = combined.lastIndexOf(secret, start - 1)
      if (index >= 0 && index < start && index + secret.length > start)
        start = index + secret.length
    }
    this.output = combined.slice(start)
  }

  private redact(value: string) {
    for (const secret of this.secrets.filter(Boolean).sort((a, b) => b.length - a.length))
      value = value.replaceAll(secret, '[redacted]')
    return value
  }

  log() {
    return [this.startupFailure, this.redact(this.output).slice(-8000)].filter(Boolean).join('\n')
  }

  start(launch: () => ChildProcess) {
    try {
      const child = launch()
      this.child = child
      this.closed = new Promise((done) => child.once('close', () => done()))
      child.stdout?.on('data', this.addLog)
      child.stderr?.on('data', this.addLog)
      child.on('error', (error) => {
        this.failureStage = 'spawn'
        this.reason = `spawn error: ${error.message}`
        this.onTermination()
      })
      child.on('exit', (code, signal) => {
        this.reason = `exit code=${code}, signal=${signal}`
        this.onTermination()
      })
    } catch (error) {
      throw this.failure('spawn', String(error))
    }
  }

  private failure(stage: string, detail: string) {
    this.startupFailure = this.redact(`Next.js startup stage=${stage}: ${detail}`)
    return new Error(
      `${this.startupFailure}\nservice.log:\n${this.redact(this.output).slice(-8000) || '(no output)'}`,
    )
  }

  async waitUntilReady(
    origin: string,
    session: { cookie: string; ownerId: string } | undefined,
    budget: number,
  ) {
    const deadline = Date.now() + budget
    let last = 'no response'
    const controller = new AbortController()
    const expired = new Promise<'timeout'>((done) => {
      controller.signal.addEventListener('abort', () => done('timeout'), { once: true })
    })
    const timer = setTimeout(() => controller.abort(), budget)
    const poll = async () => {
      while (!controller.signal.aborted && !this.reason) {
        try {
          const response = await fetch(`${origin}/api/session`, {
            headers: session ? { cookie: session.cookie } : {},
            signal: controller.signal,
          })
          last = `HTTP ${response.status}`
          if (session && response.ok) {
            last += ', reading session body'
            const body = await response.json()
            if (body?.id === session.ownerId) return 'ready' as const
            last = `HTTP ${response.status}, unexpected session identity`
          } else {
            await response.body?.cancel()
            if (!session && response.status === 401) return 'ready' as const
          }
        } catch (error) {
          if (!controller.signal.aborted) last = String(error)
        }
        if (!controller.signal.aborted)
          await delay(READINESS_POLL_MS, undefined, { signal: controller.signal }).catch(() => {})
      }
      return 'stopped' as const
    }
    try {
      const result = await Promise.race([
        poll(),
        expired,
        this.terminated.then(() => 'terminated' as const),
      ])
      if (this.reason) {
        // Exit precedes close: give pipes a bounded chance to drain before rendering.
        await Promise.race([this.closed, delay(Math.max(0, Math.min(100, deadline - Date.now())))])
        throw this.failure(this.failureStage, `${this.reason}; last readiness: ${last}`)
      }
      if (result !== 'ready')
        throw this.failure('readiness', `timeout after ${budget}ms; last readiness: ${last}`)
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
  }

  async stop() {
    const child = this.child
    if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return
    child.kill('SIGTERM')
    await Promise.race([this.closed, delay(3000)])
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill('SIGKILL')
    await Promise.race([this.closed, delay(1000)])
  }
}

/** Attempt every release even when evidence collection or another release fails. */
export async function cleanupJourney(tasks: (() => Promise<unknown>)[]) {
  const errors: unknown[] = []
  for (const task of tasks) {
    try {
      await task()
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Journey cleanup failed')
}
