import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { mergeCheck } from '../scripts/merge-check.mjs'

const jobs = ['eligibility', 'vitest', 'journeys']
const needs = (results: Record<string, string>) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(results).map(([job, result]) => [job, { result, outputs: {} }]),
    ),
  )
const allSuccess = { eligibility: 'success', vitest: 'success', journeys: 'success' }

test('passes only when every required Verify job succeeded', () => {
  expect(mergeCheck(needs(allSuccess), jobs).ok).toBe(true)
})

// Regression: a skipped required check counts as passing on GitHub, so any unsuccessful job
// result must turn the merge check red rather than letting it pass or skip.
test.each(['failure', 'skipped', 'cancelled'])('fails when a job result is %s', (result) => {
  for (const job of jobs) {
    const check = mergeCheck(needs({ ...allSuccess, [job]: result }), jobs)
    expect(check.ok).toBe(false)
    expect(check.lines).toContain(`${job}: ${result}`)
  }
})

test('fails on a missing job, unreadable input or no named jobs', () => {
  const { journeys: _, ...partial } = allSuccess
  expect(mergeCheck(needs(partial), jobs)).toMatchObject({ ok: false })
  expect(mergeCheck(needs(partial), jobs).lines).toContain('journeys: missing')
  expect(mergeCheck('', jobs).ok).toBe(false)
  expect(mergeCheck(undefined, jobs).ok).toBe(false)
  expect(mergeCheck(needs(allSuccess), []).ok).toBe(false)
})

test('the command exits nonzero unless every job succeeded', () => {
  const run = (results: Record<string, string>) =>
    spawnSync(process.execPath, [resolve('scripts/merge-check.mjs'), ...jobs], {
      env: { ...process.env, NEEDS: needs(results) },
      encoding: 'utf8',
    })
  expect(run(allSuccess).status).toBe(0)
  const failed = run({ ...allSuccess, vitest: 'cancelled' })
  expect(failed.status).toBe(1)
  expect(failed.stderr).toContain('vitest: cancelled')
})

test('Verify gates the merge check on every job and Release on Verify', () => {
  const verify = readFileSync('.github/workflows/verify.yml', 'utf8')
  const declared = [...verify.matchAll(/^ {2}([a-z-]+):$/gm)].map((match) => match[1])
  expect(declared).toEqual([...jobs, 'merge-check'])
  const job = verify.slice(verify.indexOf('\n  merge-check:'))
  expect(job).toContain(`needs: [${jobs.join(', ')}]`)
  expect(job).toContain("if: always() && github.event_name == 'pull_request'")
  expect(job).toContain(`run: node scripts/merge-check.mjs ${jobs.join(' ')}`)

  const release = readFileSync('.github/workflows/release.yml', 'utf8')
  expect(release).toContain('uses: ./.github/workflows/verify.yml')
  expect(release).toMatch(/needs: verify\n\s+if: needs\.verify\.outputs\.eligible == 'true'\n/)
})
