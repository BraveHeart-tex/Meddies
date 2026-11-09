const HOUR_MS = 3_600_000

/**
 * The next doses of an Interval schedule after `now`, as instants. A dose falls at Anchor + n x
 * hours and is expected at the Anchor only when the Anchor is later than `now`.
 */
export function nextIntervalDoses({
  anchor,
  hours,
  now,
  count = 3,
}: {
  anchor: string
  hours: number
  now: string
  count?: number
}): string[] {
  const start = Date.parse(anchor)
  const step = hours * HOUR_MS
  const first = Math.max(0, Math.floor((Date.parse(now) - start) / step) + 1)
  return Array.from({ length: count }, (_, index) =>
    new Date(start + (first + index) * step).toISOString(),
  )
}

/** 'Every hour' or 'Every 8 hours'. */
export function intervalLabel(hours: number) {
  return hours === 1 ? 'Every hour' : `Every ${hours} hours`
}
