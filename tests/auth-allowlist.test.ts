import assert from 'node:assert/strict'
import { test } from 'vitest'
import { acceptsGoogleProfile, allowedEmails, isAllowedEmail } from '../src/features/auth/allowlist'

test('each approved account signs in; unlisted or unverified emails are rejected', () => {
  const previous = process.env.AUTH_ALLOWED_EMAILS
  try {
    process.env.AUTH_ALLOWED_EMAILS = ' First@Example.test, ,second@example.test '
    assert.deepEqual(allowedEmails(), ['first@example.test', 'second@example.test'])
    const profile = { email_verified: true, sub: 'google-subject' }
    for (const email of ['first@example.test', 'SECOND@example.test'])
      assert.equal(acceptsGoogleProfile({ ...profile, email }), true, email)
    for (const patch of [
      { email: 'someone-else@example.test' },
      { email: 'first@example.test', email_verified: false },
      { email: 'first@example.test', email_verified: 'true' },
      { email: 'first@example.test', sub: '' },
      { email: undefined },
    ])
      assert.equal(acceptsGoogleProfile({ ...profile, ...patch }), false, JSON.stringify(patch))
    assert.equal(acceptsGoogleProfile(undefined), false)
    for (const value of [undefined, '', ' , ']) {
      if (value === undefined) delete process.env.AUTH_ALLOWED_EMAILS
      else process.env.AUTH_ALLOWED_EMAILS = value
      assert.deepEqual(allowedEmails(), [], String(value))
      assert.equal(acceptsGoogleProfile({ ...profile, email: 'first@example.test' }), false)
    }
  } finally {
    if (previous === undefined) delete process.env.AUTH_ALLOWED_EMAILS
    else process.env.AUTH_ALLOWED_EMAILS = previous
  }
})

test('isAllowedEmail rejects an email removed from the approved accounts', () => {
  const previous = process.env.AUTH_ALLOWED_EMAILS
  try {
    process.env.AUTH_ALLOWED_EMAILS = 'first@example.test,second@example.test'
    assert.equal(isAllowedEmail('second@example.test'), true)
    process.env.AUTH_ALLOWED_EMAILS = 'first@example.test'
    assert.equal(isAllowedEmail('second@example.test'), false)
    assert.equal(isAllowedEmail('first@example.test'), true)
  } finally {
    if (previous === undefined) delete process.env.AUTH_ALLOWED_EMAILS
    else process.env.AUTH_ALLOWED_EMAILS = previous
  }
})
