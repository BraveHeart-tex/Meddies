import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './msw-server'

// A request no handler answers rejects in the app, and screens catch fetch failures, so
// also fail the test that made it.
let unhandled: string[] = []
beforeAll(() => {
  server.events.on('request:unhandled', ({ request }) => {
    unhandled.push(`${request.method} ${request.url}`)
  })
  server.listen({ onUnhandledFrame: 'error' })
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
  vi.useRealTimers()
  const requests = unhandled
  unhandled = []
  if (requests.length) throw new Error(`Unhandled requests: ${requests.join(', ')}`)
})
afterAll(() => server.close())
