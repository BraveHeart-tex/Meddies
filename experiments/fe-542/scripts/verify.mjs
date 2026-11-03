import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verify(url, secret) {
  const run = randomUUID();
  const timings = [];
  async function call(op, values = {}, expected = 200, key = secret) {
    const start = performance.now();
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ op, run, ...values }), signal: AbortSignal.timeout(15000),
    });
    timings.push({ op, status: response.status, ms: Math.round(performance.now() - start), workerMs: response.headers.get('x-worker-ms'), upstreamMs: response.headers.get('x-upstream-ms'), region: response.headers.get('x-vercel-region-observed'), node: response.headers.get('x-node-version') });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.status, expected, `${op}: unexpected status`);
    return response.json();
  }
  await call('state', {}, 401, 'incorrect');
  await call('fixture');
  const before = await call('state');
  assert.deepEqual(before, { stock: 20, records: 0, movements: 0, reminder: { token: null, completed: 0 } });
  const action = randomUUID();
  await call('intake', { action, quantity: 2, fail: true }, 409);
  assert.deepEqual(await call('state'), before, 'failed stock movement must roll back record and stock');
  console.log('PASS migration + atomic rollback through Drizzle batch');
  const writes = await Promise.all([call('intake', { action, quantity: 2 }), call('intake', { action, quantity: 2 })]);
  console.log('Concurrent D1 batch row usage', JSON.stringify(writes.map(x => x.usage)));
  const retry = await call('intake', { action, quantity: 2 });
  console.log('Retry D1 row usage', JSON.stringify(retry.usage));
  await call('intake', { action, quantity: 3 }, 409);
  const taken = await call('state');
  assert.equal(taken.stock, 18);
  assert.equal(taken.records, 1);
  assert.equal(taken.movements, 1);
  console.log('PASS concurrent identical action + retry + payload mismatch; one stock effect');
  const tokens = [randomUUID(), randomUUID()];
  const claims = await Promise.all(tokens.map(token => call('claim', { token })));
  assert.equal(claims.filter(x => x.claimed).length, 1);
  const winner = claims.find(x => x.claimed).token;
  const loser = randomUUID();
  assert.equal((await call('complete', { token: loser })).completed, false);
  assert.equal((await call('claim', { token: loser })).claimed, false);
  await new Promise(resolve => setTimeout(resolve, 1800));
  assert.equal((await call('complete', { token: winner })).completed, false, 'expired owner fenced');
  const recovered = await call('claim', { token: loser });
  assert.equal(recovered.claimed, true, 'abandoned lease recovered');
  assert.notEqual(recovered.token, winner);
  assert.equal((await call('complete', { token: winner })).completed, false, 'stale owner fenced after reclaim');
  assert.equal((await call('complete', { token: recovered.token })).completed, true);
  assert.equal((await call('claim', { token: randomUUID() })).claimed, false);
  console.log('PASS two claimants; expiry; recovery; stale-owner fencing; completed work not reclaimed');
  console.log(JSON.stringify({ run, timings }, null, 2));
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  assert.ok(process.env.PROBE_URL && process.env.PROBE_SECRET, 'set PROBE_URL and PROBE_SECRET');
  await verify(process.env.PROBE_URL, process.env.PROBE_SECRET);
}
