/**
 * Approved accounts: `AUTH_ALLOWED_EMAILS` is a comma-separated list of Google emails,
 * trimmed, lowercased, empty entries ignored. Read on every call so a removed email ends
 * that account's sessions on the next read. An empty list leaves sign-in disabled.
 */
export function allowedEmails() {
  return (process.env.AUTH_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowedEmail(email: unknown) {
  return typeof email === 'string' && allowedEmails().includes(email.toLowerCase())
}

/** A Google profile enters only with a verified, approved email and a non-empty subject. */
export function acceptsGoogleProfile(
  profile: { email_verified?: unknown; email?: unknown; sub?: unknown } | undefined,
) {
  return Boolean(
    profile?.email_verified === true &&
    isAllowedEmail(profile.email) &&
    typeof profile.sub === 'string' &&
    profile.sub.length > 0,
  )
}
