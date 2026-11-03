import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { encode } from 'next-auth/jwt';

// Synthetic cookies test session validation, not Google identity proof.
const secret = randomBytes(32).toString('base64url');
const base = 'http://localhost:3541';
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3541'], {
  env: { ...process.env, AUTH_URL: base, AUTH_SECRET: secret, AUTH_TRUST_HOST: 'true',
    AUTH_GOOGLE_ID: 'synthetic-client', AUTH_GOOGLE_SECRET: 'synthetic-secret', AUTH_ALLOWED_EMAIL: 'approved@example.test' },
  stdio: 'ignore',
});
const request = (path, options) => fetch(`${base}${path}`, { redirect: 'manual', ...options });
const salt = 'authjs.session-token';
const cookie = async claims => `${salt}=${await encode({ secret, salt, token: claims, maxAge: 120 })}`;
const now = Math.floor(Date.now() / 1000);
const valid = { sub: 'google:synthetic-subject', email: 'approved@example.test', deadline: now + 120 };

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(child.exitCode, null, 'test server still running');
    try { ready = (await request('/')).status === 200; } catch {}
    if (ready) break;
    await delay(100);
  }
  assert(ready, 'test server ready');
  const anon = await request('/api/private');
  assert.equal(anon.status, 401);
  assert.match(anon.headers.get('cache-control'), /no-store/);
  console.log('PASS anonymous denied, no-store');

  const validCookie = await cookie(valid);
  const signedIn = await request('/api/private', { headers: { cookie: validCookie } });
  assert.equal(signedIn.status, 200);
  assert.deepEqual(await signedIn.json(), { userId: 'google:synthetic-subject', expires: new Date(valid.deadline * 1000).toISOString() });
  assert.equal((await request('/api/private', { headers: { cookie: validCookie } })).status, 200);
  console.log('PASS synthetic session persists across requests with stable user ID');

  for (const claims of [{ ...valid, email: 'other@example.test' }, { ...valid, deadline: now - 1 }, { ...valid, sub: undefined }]) {
    assert.equal((await request('/api/private', { headers: { cookie: await cookie(claims) } })).status, 401);
  }
  assert.equal((await request('/api/private', { headers: { cookie: `${salt}=corrupt` } })).status, 401);
  console.log('PASS non-allowlisted, expired, missing identity and corrupt sessions denied');

  const session = await request('/api/auth/session', { headers: { cookie: validCookie } });
  const body = await session.json();
  assert.deepEqual(Object.keys(body.user), ['id']);
  assert(!JSON.stringify(body).includes('approved@example.test'));
  console.log('PASS session response omits email and provider tokens');

  const missingCsrf = await request('/api/auth/signout', { method: 'POST', headers: { cookie: validCookie } });
  assert(!missingCsrf.headers.getSetCookie().some(value => value.startsWith(`${salt}=`)));
  console.log('PASS sign-out without CSRF does not clear session');

  const csrf = await request('/api/auth/csrf');
  const { csrfToken } = await csrf.json();
  const csrfCookies = csrf.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const signout = await request('/api/auth/signout', { method: 'POST',
    headers: { cookie: `${validCookie}; ${csrfCookies}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, callbackUrl: base }),
  });
  assert.equal(signout.status, 302);
  assert(signout.headers.getSetCookie().some(value => value.startsWith(`${salt}=;`) && /Max-Age=0/i.test(value)));
  assert.equal((await request('/api/private')).status, 401);
  console.log('PASS CSRF-protected sign-out clears cookie; anonymous request denied');

  const badCallback = await request('/api/auth/callback/google?code=synthetic-invalid&state=synthetic-invalid');
  assert.equal(badCallback.status, 302);
  assert.match(badCallback.headers.get('location'), /error=/);
  assert(!badCallback.headers.getSetCookie().some(value => value.startsWith(`${salt}=`) && !value.startsWith(`${salt}=;`)));
  console.log('PASS invalid callback cannot create session');
} finally {
  if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
}
