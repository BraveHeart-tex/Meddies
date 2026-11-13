import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createServer, type AddressInfo } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { designFrames } from '../src/features/design-lab/frames'

// HTTP integration on the production build: the lab ships nothing, and its status must be
// decided before a loading boundary can flush HTTP 200. Dev rendering is `pnpm lab:capture`'s.
describe('design lab under next start', () => {
  let child: ChildProcess
  let origin: string
  let logs = ''
  beforeAll(async () => {
    const listener = createServer()
    listener.listen(0, '127.0.0.1')
    await once(listener, 'listening')
    const { port } = listener.address() as AddressInfo
    await new Promise<void>((done) => listener.close(() => done()))
    origin = `http://localhost:${port}`
    child = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
      {
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    child.stdout?.on('data', (data) => {
      logs = (logs + data).slice(-4000)
    })
    child.stderr?.on('data', (data) => {
      logs = (logs + data).slice(-4000)
    })
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(logs)
      if (logs.includes('Ready in')) return
      await delay(100)
    }
    throw new Error(`Server did not start: ${logs}`)
  }, 65_000)
  afterAll(async () => {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await once(child, 'exit')
    }
  })

  test('the index, unknown frames and every registered frame return the themed HTTP 404', async () => {
    for (const path of [
      '/lab',
      '/lab/unknown',
      '/lab/109-l1/extra',
      ...designFrames.map(({ slug }) => `/lab/${slug}`),
    ]) {
      const response = await fetch(`${origin}${path}`)
      expect(response.status, path).toBe(404)
      const html = await response.text()
      expect(html, path).toContain('This page isn')
      expect(html, path).not.toContain('Cold launch')
    }
  }, 60_000)
})
