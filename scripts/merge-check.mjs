/**
 * The required PR check for main (docs/deployment.md "Verify workflow"). GitHub counts a skipped
 * required check as passing, so Verify's `Merge check` job runs after every other job whatever
 * their outcome and passes only when each one succeeded: a failed, skipped or cancelled job, or
 * a missing result, fails it.
 *
 * Usage: NEEDS='${{ toJSON(needs) }}' node scripts/merge-check.mjs <job>...
 */
import { pathToFileURL } from 'node:url'

export function mergeCheck(needsJson, required) {
  let needs
  try {
    needs = JSON.parse(needsJson ?? '')
  } catch {
    return { ok: false, lines: ['Merge check: job results are not valid JSON'] }
  }
  if (required.length === 0) return { ok: false, lines: ['Merge check: no required jobs named'] }
  const lines = required.map((job) => `${job}: ${needs?.[job]?.result ?? 'missing'}`)
  const ok = required.every((job) => needs?.[job]?.result === 'success')
  return { ok, lines: [...lines, ok ? 'Merge check passed' : 'Merge check failed'] }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { ok, lines } = mergeCheck(process.env.NEEDS, process.argv.slice(2))
  for (const line of lines) (ok ? console.log : console.error)(line)
  process.exitCode = ok ? 0 : 1
}
