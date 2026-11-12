import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createServer, type AddressInfo } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { designFrames } from '../src/features/design-lab/frames'

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
      for (const path of ['/lab/unknown', '/lab/109-l1/extra']) {
        const response = await fetch(`${origin}${path}`)
        expect(response.status, path).toBe(404)
        expect(await response.text()).toContain('This page isn')
      }
    }, 60_000)

    test('the index lists every registered frame only in dev', async () => {
      const response = await fetch(`${origin}/lab`)
      const html = await response.text()
      expect(response.status).toBe(mode === 'dev' ? 200 : 404)
      if (mode === 'start') {
        expect(html).toContain('This page isn')
        expect(html).not.toContain('Cold launch')
        return
      }
      expect(html).toContain('109·L1')
      expect(html).toContain('Cold launch')
      // lab:capture discovers frames from these links.
      for (const { slug } of designFrames) expect(html).toContain(`href="/lab/${slug}"`)
    }, 60_000)

    // Every frame, so a server/client boundary break (a hook module imported into the server
    // registry) fails here, not only in a capture. Typecheck, lint and the build all pass it.
    test('every registered frame renders only in dev', async () => {
      for (const { slug } of designFrames) {
        const response = await fetch(`${origin}/lab/${slug}`)
        const html = await response.text()
        if (mode === 'start') {
          expect(response.status, slug).toBe(404)
          expect(html, slug).toContain('This page isn')
          continue
        }
        expect(response.status, slug).toBe(200)
        // A render error still streams 200 once the loading boundary flushed; React then marks
        // the fallback to client rendering, which the dev error overlay reports.
        expect(html, slug).not.toContain('<!--$!-->')
        expect(html, slug).not.toContain('data-dgst=')
      }
      if (mode === 'dev') {
        const cold = await (await fetch(`${origin}/lab/109-l1`)).text()
        expect(cold).toContain('Opening Meddies')
        expect(cold).toContain('aria-label="Primary"')
      }
    }, 180_000)
  })
}
