import assert from 'node:assert/strict';

const base = process.env.PROBE_URL;
assert(base, 'Set PROBE_URL to the deployed spike origin');
const response = await fetch(new URL('/api/private', base), { redirect: 'manual' });
assert.equal(response.status, 401);
assert.match(response.headers.get('cache-control'), /no-store/);
assert.deepEqual(await response.json(), { error: 'Unauthorized' });
console.log('PASS anonymous access denied, no-store');
if (process.env.EXPECT_UNCONFIGURED === '1') {
  for (const method of ['GET', 'POST']) {
    const disabled = await fetch(new URL('/api/auth/signin', base), { method, redirect: 'manual' });
    assert.equal(disabled.status, 503);
    assert.match(disabled.headers.get('cache-control'), /no-store/);
    assert.deepEqual(await disabled.json(), { error: 'Authentication is not configured' });
  }
  console.log('PASS missing configuration fails closed for GET and POST');
}
