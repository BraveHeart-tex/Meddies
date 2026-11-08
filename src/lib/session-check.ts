/** A failed browser read of private data. A 401 starts the session check. */
export class PrivateReadError extends Error {
  constructor(readonly status: number) {
    super('private_read_failed')
  }
}

let ended: (() => void) | undefined
let checking: Promise<void> | null = null

/** Session end registers here, so reads and saves can reach it without importing it. */
export function whenSessionEndConfirmed(handler: () => void) {
  ended = handler
}

async function check() {
  try {
    const response = await fetch('/api/session', {
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    })
    if (response.status === 401) ended?.()
  } catch {
    // Network loss is not proof of sign-out. Server operations still authenticate independently.
  }
}

/**
 * Asks the server whether the session is over; only its 401 ends the session. Settles once the
 * answer is known or unavailable, and concurrent callers share one check.
 */
export function confirmSessionEnd() {
  checking ??= check().finally(() => {
    checking = null
  })
  return checking
}
