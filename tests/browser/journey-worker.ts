// One local Worker (Miniflare) per Playwright worker, shared by the journeys that run on it.
// Starting workerd and applying every migration cost ~250ms, so they happen once per
// Playwright worker; each journey then gets the same database emptied, and its own clock.
// The Worker secret is per Playwright worker. Worker rules and the request log live in the
// per-journey proxy (worker-proxy.ts), never here.
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

export type JourneyDatabase = Awaited<ReturnType<Miniflare['getD1Database']>>

export type JourneyWorker = {
  /** The Worker's own URL; journeys reach it through their proxy. */
  url: URL
  secret: string
  /**
   * Hand the Worker to the next journey: an empty, migrated database, and the scheduling clock
   * read from `clockFile`, or real time without one.
   */
  startJourney(clockFile: string | undefined): Promise<JourneyDatabase>
  dispose(): Promise<void>
}

export async function startJourneyWorker(
  workerRoot = resolve('.worker-build'),
): Promise<JourneyWorker> {
  const secret = randomBytes(32).toString('base64url')
  let clockFile: string | undefined
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      modulesRoot: workerRoot,
      modules: [
        {
          type: 'ESModule',
          path: resolve(workerRoot, 'journey-entry.js'),
          // An empty clock answer means real time.
          contents: `
            import { createWorker } from './index.js'
            export default {
              async fetch(request, env) {
                const response = await env.JOURNEY_CLOCK.fetch('http://clock/')
                const now = await response.text()
                return createWorker(now ? () => new Date(now) : undefined).fetch(request, env)
              },
            }
          `,
        },
        { type: 'ESModule', path: resolve(workerRoot, 'index.js') },
      ],
      serviceBindings: {
        JOURNEY_CLOCK: async () => new Response(clockFile ? await readFile(clockFile, 'utf8') : ''),
      },
      compatibilityDate: '2026-11-03',
      host: '127.0.0.1',
      d1Databases: ['DB'],
      bindings: { MEDICINES_WORKER_SECRET: secret },
    }),
  )
  try {
    // Dynamic import: Playwright loads specs as CommonJS, and this helper uses import.meta.
    const { applyD1Migrations, clearD1Database } = await import('../helpers/d1-migrations.mjs')
    const db = await miniflare.getD1Database('DB')
    await applyD1Migrations(db)
    const url = await miniflare.ready
    return {
      url,
      secret,
      async startJourney(nextClockFile) {
        clockFile = nextClockFile
        await clearD1Database(db)
        return db
      },
      dispose: () => miniflare.dispose(),
    }
  } catch (error) {
    await miniflare.dispose()
    throw error
  }
}
