import { afterAll } from 'vitest'

// Points the medicine storage transport at a synthetic Worker for the file, restoring the
// real fetch and configuration afterwards. Tests answer by replacing globalThis.fetch.
export function installSyntheticWorker() {
  const originalFetch = globalThis.fetch
  const original = {
    MEDICINES_WORKER_URL: process.env.MEDICINES_WORKER_URL,
    MEDICINES_WORKER_SECRET: process.env.MEDICINES_WORKER_SECRET,
  }
  process.env.MEDICINES_WORKER_URL = 'https://worker.test'
  process.env.MEDICINES_WORKER_SECRET = 'synthetic-capability'
  afterAll(() => {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
}
