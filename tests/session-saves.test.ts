import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { requestSave } from '../src/lib/session-saves'

const url = 'https://meddies.test/api/medicines'
const server = setupServer()
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

test('refused saves are rejected rather than left unconfirmed for retry', async () => {
  for (const status of [403, 413, 415]) {
    server.use(http.post(url, () => new HttpResponse(null, { status })))
    expect(await requestSave(url, { id: 'attempt' }, (data) => data), `HTTP ${status}`).toEqual({
      problem: 'rejected',
    })
  }
})
