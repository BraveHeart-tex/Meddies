export type Clock = { now: () => Date }

/**
 * A clock anchored on a server-provided instant: `now()` is the anchor plus monotonic time
 * elapsed since anchoring. It never reads the device wall clock, so a frozen or skewed server
 * time carries through, and device clock changes cannot move it.
 */
export function anchoredClock(
  serverNow: string,
  monotonic: () => number = () => performance.now(),
): Clock {
  const anchor = Date.parse(serverNow)
  if (!Number.isFinite(anchor)) throw new RangeError(`Invalid server now: ${serverNow}`)
  const anchoredAt = monotonic()
  return { now: () => new Date(anchor + (monotonic() - anchoredAt)) }
}
