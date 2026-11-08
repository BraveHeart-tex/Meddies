/** The complete set of private destinations supported by sign-in. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (['/', '/medications', '/medications?add', '/history', '/settings'].includes(value))
    return value
  if (/^\/history\?date=\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = value.slice('/history?date='.length)
    const parsed = new Date(`${date}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
      ? value
      : '/'
  }
  return /^\/medications\?(?:medicine|schedule)=[a-f0-9-]{36}$/i.test(value) ? value : '/'
}

/** Auth.js stores an absolute callback URL. Never accept another origin. */
export function callbackReturnTo(value: string | undefined, origin: string): string {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return '/'
  if (value.startsWith('/')) return safeReturnTo(value)
  try {
    const url = new URL(value, origin)
    if (url.origin !== new URL(origin).origin || url.hash || url.username || url.password)
      return '/'
    if (value !== `${url.origin}${url.pathname}${url.search}`) return '/'
    return safeReturnTo(`${url.pathname}${url.search}`)
  } catch {
    return '/'
  }
}
