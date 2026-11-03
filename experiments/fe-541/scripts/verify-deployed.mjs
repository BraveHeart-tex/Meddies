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
if (process.env.EXPECT_CONFIGURED === '1') {
  const providers = await fetch(new URL('/api/auth/providers', base));
  assert.equal(providers.status, 200);
  assert((await providers.json()).google);
  console.log('PASS Google provider configured');

  const csrf = await fetch(new URL('/api/auth/csrf', base));
  assert.equal(csrf.status, 200);
  const { csrfToken } = await csrf.json();
  const cookies = csrf.headers.getSetCookie();
  const secureCookie = (values, name) => values.some(value => value.startsWith(`${name}=`) &&
    /; Secure/i.test(value) && /; HttpOnly/i.test(value) && /; SameSite=Lax/i.test(value));
  assert(secureCookie(cookies, '__Host-authjs.csrf-token'));
  const cookie = cookies.map(value => value.split(';')[0]).join('; ');
  const signin = await fetch(new URL('/api/auth/signin/google', base), {
    method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, callbackUrl: base }),
  });
  assert.equal(signin.status, 302);
  const location = new URL(signin.headers.get('location'));
  assert.equal(location.hostname, 'accounts.google.com');
  assert.equal(location.searchParams.get('redirect_uri'), new URL('/api/auth/callback/google', base).href);
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert(location.searchParams.get('state'));
  assert(location.searchParams.get('code_challenge'));
  for (const name of ['__Secure-authjs.pkce.code_verifier', '__Secure-authjs.state']) {
    assert(secureCookie(signin.headers.getSetCookie(), name));
  }
  console.log('PASS exact Google callback, state, S256 PKCE and secure transient cookies');

  const invalid = await fetch(new URL('/api/auth/callback/google?code=synthetic-invalid&state=synthetic-invalid', base), { redirect: 'manual' });
  assert.equal(invalid.status, 302);
  assert.match(invalid.headers.get('location'), /error=/);
  assert(!invalid.headers.getSetCookie().some(value => value.startsWith('__Secure-authjs.session-token=') &&
    !value.startsWith('__Secure-authjs.session-token=;')));
  console.log('PASS invalid callback denied without session');
}
