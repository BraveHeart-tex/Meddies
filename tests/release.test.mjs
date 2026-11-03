import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const sha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'meddies-release-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const log = join(dir, 'commands')
  await writeFile(
    join(dir, 'pnpm'),
    `#!/bin/bash
printf '%s\\n' "$*" >> "$COMMAND_LOG"
case "$*" in
  *'migrations apply'*) stage=migrations ;;
  *'wrangler deploy'*) stage=worker ;;
  *'vercel deploy'*) stage=app ;;
esac
if [[ "$FAIL_STAGE" == "$stage" ]]; then exit 1; fi
if [[ "$stage" == app ]]; then echo https://synthetic.vercel.app; fi
`,
    { mode: 0o755 },
  )
  await writeFile(
    join(dir, 'curl'),
    `#!/bin/bash
printf '%s\\n' "curl $*" >> "$COMMAND_LOG"
if [[ "$FAIL_STAGE" == smoke ]]; then exit 22; fi
case "$*" in
  *worker.example.test*) printf 401 ;;
  *) printf 200 ;;
esac
`,
    { mode: 0o755 },
  )
  return {
    run(fail = '') {
      return spawnSync('bash', [resolve('scripts/release.sh')], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          COMMAND_LOG: log,
          FAIL_STAGE: fail,
          GITHUB_SHA: sha,
          RELEASE_SETUP_CONFIRMED: 'true',
          CLOUDFLARE_API_TOKEN: 'synthetic',
          CLOUDFLARE_ACCOUNT_ID: 'synthetic',
          VERCEL_TOKEN: 'synthetic',
          VERCEL_ORG_ID: 'synthetic',
          VERCEL_PROJECT_ID: 'synthetic',
          MEDICINES_WORKER_URL: 'https://worker.example.test',
        },
      })
    },
    async commands() {
      return (await readFile(log, 'utf8')).trim().split('\n')
    },
  }
}

test('release migrates D1, deploys Worker then app, and smokes without mutations', async (t) => {
  const f = await fixture(t)
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  const commands = await f.commands()
  assert.match(commands[0], /wrangler d1 migrations apply meddies --remote/)
  assert.match(commands[1], new RegExp(`wrangler deploy .*--tag ${sha}`))
  assert.match(commands[2], new RegExp(`vercel deploy --prod .*githubCommitSha=${sha}`))
  assert.match(commands[3], /curl .*https:\/\/synthetic.vercel.app/)
  assert.match(commands[4], /curl .*https:\/\/worker.example.test/)
  assert.equal(commands.length, 5)
})

for (const [stage, commandCount] of [
  ['migrations', 1],
  ['worker', 2],
  ['app', 3],
  ['smoke', 4],
]) {
  test(`${stage} failure stops later stages and identifies commit and recovery`, async (t) => {
    const f = await fixture(t)
    const result = f.run(stage)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, new RegExp(`Release ${sha} failed at ${stage}`))
    assert.match(result.stderr, /docs\/deployment.md recovery/)
    assert.equal((await f.commands()).length, commandCount)
  })
}

test('rerun after Worker failure reapplies pending migrations before deployment', async (t) => {
  const f = await fixture(t)
  assert.notEqual(f.run('worker').status, 0)
  assert.equal(f.run().status, 0)
  const commands = await f.commands()
  assert.match(commands[2], /migrations apply meddies --remote/)
  assert.match(commands[3], /wrangler deploy/)
})

test('failed verification stops before build and tests', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'meddies-verify-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const log = join(dir, 'commands')
  await writeFile(
    join(dir, 'pnpm'),
    `#!/bin/bash
printf '%s\\n' "$*" >> "$COMMAND_LOG"
[[ "$*" != typecheck ]]
`,
    { mode: 0o755 },
  )
  const result = spawnSync('bash', [resolve('scripts/verify.sh')], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, COMMAND_LOG: log },
  })
  assert.notEqual(result.status, 0)
  assert.deepEqual((await readFile(log, 'utf8')).trim().split('\n'), [
    'lint',
    'format:check',
    'typecheck',
  ])
})
