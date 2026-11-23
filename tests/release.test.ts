import type { TestContext } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'vitest'

const bookmark = '00000001-00000002-00000003-00000004'
const sha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'meddies-release-'))
  t.onTestFinished(() => rm(dir, { recursive: true, force: true }))
  const log = join(dir, 'commands')
  const summary = join(dir, 'summary')
  await writeFile(
    join(dir, 'pnpm'),
    `#!/bin/bash
printf '%s\\n' "$*" >> "$COMMAND_LOG"
case "$*" in
  *'time-travel info'*) stage=bookmark ;;
  *'migrations apply'*) stage=migrations ;;
  *'wrangler deploy'*) stage=worker ;;
  *'vercel deploy'*) stage=app ;;
  *'vercel inspect'*) stage=smoke ;;
esac
if [[ "$FAIL_STAGE" == "$stage" ]]; then exit 1; fi
if [[ "$stage" == bookmark && "$FAIL_STAGE" == invalid-bookmark ]]; then
  printf '%s\\n' '{"bookmark":"synthetic-secret"}'
  exit 0
fi
if [[ "$stage" == bookmark ]]; then
  printf '%s\\n' '{"bookmark":"${bookmark}","extra":"synthetic-secret"}'
fi
if [[ "$stage" == app && "$FAIL_STAGE" == invalid-deployment-url ]]; then
  echo https://synthetic.example.test
  exit 0
fi
if [[ "$stage" == app ]]; then echo https://synthetic.vercel.app; fi
if [[ "$stage" == smoke ]]; then
  echo 'Error: User not found.' >&2
  exit 1
fi
`,
    { mode: 0o755 },
  )
  await writeFile(
    join(dir, 'curl'),
    `#!/bin/bash
printf '%s\\n' "curl $*" >> "$COMMAND_LOG"
if [[ "$FAIL_STAGE" == http ]]; then exit 22; fi
# The generated deployment is protected; only its public production alias works.
if [[ "$*" == *synthetic.vercel.app* ]]; then printf 401; exit 22; fi
case "$*" in
  *worker.example.test*)
    [[ "$*" == *'CF-Access-Client-Id: synthetic-access-id'* ]] || exit 23
    [[ "$*" == *'CF-Access-Client-Secret: synthetic-access-secret'* ]] || exit 23
    [[ "$*" != *'Authorization:'* && "$*" != *'--location'* ]] || exit 23
    while [[ "$#" -gt 0 ]]; do
      if [[ "$1" == --output ]]; then
        shift
        if [[ "$FAIL_STAGE" == access-denied ]]; then
          printf '%s' '{"error":"access_denied"}' > "$1"
        else
          printf '%s' '{"error":"unauthorized"}' > "$1"
        fi
        break
      fi
      shift
    done
    if [[ "$FAIL_STAGE" == access-redirect ]]; then printf 302; else printf 401; fi
    ;;
  *)
    [[ "$*" != *'CF-Access-'* ]] || exit 23
    if [[ "$FAIL_STAGE" == app-status ]]; then printf 503; else printf 200; fi
    ;;
esac
`,
    { mode: 0o755 },
  )
  const apiStub = join(dir, 'deployment-api.mjs')
  await writeFile(
    apiStub,
    `
import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
globalThis.fetch = async (input, options) => {
  const url = new URL(input)
  appendFileSync(process.env.COMMAND_LOG, 'deployment-api ' + url + '\\n')
  assert.equal(url.origin, 'https://api.vercel.com')
  assert.equal(url.pathname, '/v13/deployments/production.example.test')
  assert.equal(url.searchParams.get('teamId'), 'synthetic')
  assert.equal(options.headers.Authorization, 'Bearer synthetic')
  if (process.env.FAIL_STAGE === 'smoke') return new Response(null, { status: 403 })
  return Response.json({
    url: process.env.FAIL_STAGE === 'stale-alias' ? 'previous.vercel.app' : 'synthetic.vercel.app',
    readyState: 'READY', target: 'production',
    projectId: process.env.FAIL_STAGE === 'wrong-project' ? 'other' : 'synthetic',
    meta: { githubCommitSha: process.env.FAIL_STAGE === 'wrong-commit' ? 'other' : process.env.GITHUB_SHA },
  })
}
`,
  )
  return {
    run(fail = '', overrides: Record<string, string> = {}) {
      return spawnSync('bash', [resolve('scripts/release.sh')], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          COMMAND_LOG: log,
          FAIL_STAGE: fail,
          NODE_OPTIONS: `--import ${apiStub}`,
          GITHUB_SHA: sha,
          GITHUB_STEP_SUMMARY: summary,
          RELEASE_SETUP_CONFIRMED: 'true',
          CLOUDFLARE_API_TOKEN: 'synthetic-secret',
          CLOUDFLARE_ACCOUNT_ID: 'synthetic',
          VERCEL_TOKEN: 'synthetic',
          VERCEL_ORG_ID: 'synthetic',
          VERCEL_PROJECT_ID: 'synthetic',
          MEDICINES_WORKER_URL: 'https://worker.example.test',
          PRODUCTION_APP_URL: 'https://production.example.test',
          WORKER_ACCESS_CLIENT_ID: 'synthetic-access-id',
          WORKER_ACCESS_CLIENT_SECRET: 'synthetic-access-secret',
          ...overrides,
        },
      })
    },
    summary: () => readFile(summary, 'utf8'),
    async commands() {
      return (await readFile(log, 'utf8')).trim().split('\n')
    },
  }
}

test('release records a safe bookmark before migrations, deploys Worker then app, and smokes', async (t) => {
  const f = await fixture(t)
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  const commands = await f.commands()
  assert.match(
    commands[0],
    /wrangler d1 time-travel info meddies --config worker\/wrangler.jsonc --json/,
  )
  assert.match(result.stdout, new RegExp(bookmark))
  const summary = await f.summary()
  assert.match(summary, new RegExp(bookmark))
  assert.match(summary, new RegExp(sha))
  assert.doesNotMatch(summary, /synthetic-secret/)
  assert.doesNotMatch(result.stdout, /synthetic-secret/)
  assert.doesNotMatch(result.stdout + result.stderr + summary, /synthetic-access/)
  assert.match(commands[1], /wrangler d1 migrations apply meddies --remote/)
  assert.match(commands[2], new RegExp(`wrangler deploy .*--tag ${sha}`))
  assert.match(commands[3], new RegExp(`vercel deploy --prod .*githubCommitSha=${sha}`))
  assert.match(
    commands[4],
    /deployment-api https:\/\/api.vercel.com\/v13\/deployments\/production.example.test\?teamId=synthetic/,
  )
  assert.match(commands[5], /curl .*https:\/\/production.example.test/)
  assert.match(commands[6], /curl .*https:\/\/worker.example.test/)
  assert.equal(commands.length, 7)
})

test('release requires both Access secrets before any production mutation and wires them from environment secrets', async (t) => {
  const workflow = await readFile('.github/workflows/release.yml', 'utf8')
  for (const name of ['WORKER_ACCESS_CLIENT_ID', 'WORKER_ACCESS_CLIENT_SECRET']) {
    assert.ok(workflow.includes(`${name}: \u0024{{ secrets.${name} }}`))
    const f = await fixture(t)
    const result = f.run('', { [name]: '' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, new RegExp(`Missing release configuration: ${name}`))
    assert.match(result.stderr, /failed at preflight/)
    await assert.rejects(f.commands(), { code: 'ENOENT' })
  }
})

// Each override fails one bare preflight `[[ ]]` assertion.
for (const [name, value] of [
  ['RELEASE_SETUP_CONFIRMED', ''],
  ['GITHUB_SHA', '0000000000000000000000000000000000000000'],
  ['MEDICINES_WORKER_URL', 'http://worker.example.test'],
  ['PRODUCTION_APP_URL', 'https://production.example.test/path'],
] as const) {
  test(`invalid ${name} fails preflight before any production mutation`, async (t) => {
    const f = await fixture(t)
    const result = f.run('', { [name]: value })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Release \w+ failed at preflight/)
    await assert.rejects(f.commands(), { code: 'ENOENT' })
  })
}

for (const [stage, commandCount] of [
  ['bookmark', 1],
  ['invalid-bookmark', 1],
  ['migrations', 2],
  ['worker', 3],
  ['app', 4],
  ['invalid-deployment-url', 4],
  ['smoke', 5],
] as const) {
  const reported = { 'invalid-bookmark': 'bookmark', 'invalid-deployment-url': 'app' }[
    stage as string
  ]
  test(`${stage} failure stops later stages and identifies commit and recovery`, async (t) => {
    const f = await fixture(t)
    const result = f.run(stage)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, new RegExp(`Release ${sha} failed at ${reported ?? stage}`))
    assert.match(result.stderr, /docs\/deployment.md recovery/)
    assert.equal((await f.commands()).length, commandCount)
    const summary = await f.summary()
    assert.doesNotMatch(summary, /synthetic-secret/)
    if (commandCount > 1) assert.match(summary, new RegExp(bookmark))
  })
}

test('rerun after Worker failure reapplies pending migrations before deployment', async (t) => {
  const f = await fixture(t)
  assert.notEqual(f.run('worker').status, 0)
  assert.equal(f.run().status, 0)
  const commands = await f.commands()
  assert.match(commands[4], /migrations apply meddies --remote/)
  assert.match(commands[5], /wrangler deploy/)
})

test('failed verification stops before build and tests', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'meddies-verify-'))
  t.onTestFinished(() => rm(dir, { recursive: true, force: true }))
  const log = join(dir, 'commands')
  await writeFile(
    join(dir, 'pnpm'),
    `#!/bin/bash
printf '%s\\n' "$*" >> "$COMMAND_LOG"
[[ "$*" != typecheck ]]
`,
    { mode: 0o755 },
  )
  // Its own directory: verify stops when this checkout's .next/dev lock is held, as it is
  // while verify:local runs the lab HTTP test alongside this one.
  const result = spawnSync(process.execPath, [resolve('scripts/verify.mjs')], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, COMMAND_LOG: log },
  })
  assert.notEqual(result.status, 0)
  assert.deepEqual(
    (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => line.split(' --')[0])
      .sort(),
    ['format:check', 'lint', 'typecheck'],
  )
})

for (const [failure, count] of [
  ['stale-alias', 5],
  ['wrong-project', 5],
  ['wrong-commit', 5],
  ['http', 6],
  ['app-status', 6],
  ['access-denied', 7],
  ['access-redirect', 7],
] as const) {
  test(`${failure} fails smoke instead of accepting an unverified production release`, async (t) => {
    const f = await fixture(t)
    const result = f.run(failure)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, new RegExp(`Release ${sha} failed at smoke`))
    assert.equal((await f.commands()).length, count)
  })
}
