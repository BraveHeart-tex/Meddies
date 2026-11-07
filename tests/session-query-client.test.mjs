import assert from 'node:assert/strict'
import { test } from 'node:test'
import { endSessionQueryClient, sessionQueryClient } from '../src/lib/session-query-client.ts'

const key = ['medicines', 'list']

test('the same session keeps one client across calls, so navigation reuses its cache', () => {
  const client = sessionQueryClient('owner-a:2026-11-14T00:00:00.000Z')
  client.setQueryData(key, ['Aspirin'])
  assert.equal(sessionQueryClient('owner-a:2026-11-14T00:00:00.000Z'), client)
  assert.deepEqual(client.getQueryData(key), ['Aspirin'])
  endSessionQueryClient()
})

test('a new session gets a fresh client and the previous cache is cleared', () => {
  const previous = sessionQueryClient('owner-a:2026-11-14T00:00:00.000Z')
  previous.setQueryData(key, ['Aspirin'])
  const next = sessionQueryClient('owner-a:2026-11-15T00:00:00.000Z')
  assert.notEqual(next, previous)
  assert.equal(next.getQueryData(key), undefined)
  assert.equal(previous.getQueryData(key), undefined)
  endSessionQueryClient()
})

test('a response that settles after the session changes cannot repopulate the new cache', async () => {
  const previous = sessionQueryClient('owner-a:2026-11-14T00:00:00.000Z')
  let settle
  const read = previous
    .fetchQuery({ queryKey: key, queryFn: () => new Promise((resolve) => (settle = resolve)) })
    .catch(() => 'cancelled')
  const next = sessionQueryClient('owner-b:2026-11-14T00:00:00.000Z')
  settle(['Aspirin'])
  assert.equal(await read, 'cancelled')
  assert.equal(next.getQueryData(key), undefined)
  assert.equal(previous.getQueryData(key), undefined)
  endSessionQueryClient()
})

test('ending the session clears its cache and the next session starts empty', () => {
  const client = sessionQueryClient('owner-a:2026-11-14T00:00:00.000Z')
  client.setQueryData(key, ['Aspirin'])
  endSessionQueryClient()
  assert.equal(client.getQueryData(key), undefined)
  const again = sessionQueryClient('owner-a:2026-11-14T00:00:00.000Z')
  assert.notEqual(again, client)
  assert.equal(again.getQueryData(key), undefined)
  endSessionQueryClient()
})

test('stale data refreshes on entry, focus and reconnect, without polling or silent retries', () => {
  const { queries } = sessionQueryClient('owner-a:2026-11-14T00:00:00.000Z').getDefaultOptions()
  assert.equal(queries?.staleTime, 30_000)
  assert.equal(queries?.refetchOnMount, true)
  assert.equal(queries?.refetchOnWindowFocus, true)
  assert.equal(queries?.refetchOnReconnect, true)
  assert.equal(queries?.refetchInterval, false)
  assert.equal(queries?.retry, false)
  endSessionQueryClient()
})
