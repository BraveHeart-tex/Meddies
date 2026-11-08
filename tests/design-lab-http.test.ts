import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createServer, type AddressInfo } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

// HTTP integration: status must be decided before a loading boundary can flush HTTP 200.
for (const mode of ['dev', 'start'] as const) {
  describe(`design lab under ${mode}`, () => {
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
        [
          'node_modules/next/dist/bin/next',
          mode,
          ...(mode === 'dev' ? ['--webpack'] : []),
          '-p',
          String(port),
        ],
        {
          env: { ...process.env, NODE_ENV: mode === 'dev' ? 'development' : 'production' },
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

    test('unknown frames return the themed HTTP 404', async () => {
      for (const path of ['/lab/unknown', '/lab/649-l1/extra']) {
        const response = await fetch(`${origin}${path}`)
        expect(response.status, path).toBe(404)
        expect(await response.text()).toContain('This page isn')
      }
    }, 60_000)

    test('registered frames and index are available only in dev', async () => {
      for (const path of ['/lab', '/lab/649-l1']) {
        const response = await fetch(`${origin}${path}`)
        const html = await response.text()
        expect(response.status, path).toBe(mode === 'dev' ? 200 : 404)
        if (mode === 'start') {
          expect(html).toContain('This page isn')
          expect(html).not.toContain('Cold launch')
        } else if (path === '/lab') {
          expect(html).toContain('649·L1')
          expect(html).toContain('Cold launch')
          expect(html).toContain('href="/lab/649-l1"')
        } else {
          expect(html).toContain('Opening Meddies')
          expect(html).toContain('aria-label="Primary"')
        }
      }
    }, 60_000)
  })
}
