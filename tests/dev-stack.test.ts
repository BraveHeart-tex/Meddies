import type { TestContext } from 'vitest'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, mkdir, chmod, access } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'

const script = fileURLToPath(new URL('../scripts/dev-stack.mjs', import.meta.url))
const secret = 'a'.repeat(40)
// Every script run has its own deadline, so a stuck command fails with its output.
// Each test's timeout covers its runs' deadlines (including the fixture's cleanup stop),
// which exceed the 5s default.
const commandDeadline = 30_000
const startDeadline = 205_000
const budget = ({ starts = 0, commands = 0 }) => ({
  timeout: starts * startDeadline + commands * commandDeadline + 5_000,
})

function run(
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
  timeout = commandDeadline,
) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string }>(
    (resolve) => {
      const child = spawn(process.execPath, [script, ...args], {
        cwd,
        env: { ...process.env, ...extraEnv },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      const collect = (data: Buffer) => {
        output += data
      }
      child.stdout.on('data', collect)
      child.stderr.on('data', collect)
      const timer = setTimeout(() => child.kill('SIGKILL'), timeout)
      child.on('close', (code, signal) => {
        clearTimeout(timer)
        resolve({ code, signal, output })
      })
    },
  )
}

async function fixture(t: TestContext, extra: Record<string, string> = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'meddies-stack-'))
  const bin = path.join(cwd, 'bin')
  await mkdir(bin)
  await writeFile(path.join(cwd, '.env.local'), `MEDICINES_WORKER_SECRET=${secret}\n`)
  await mkdir(path.join(cwd, 'worker'))
  await writeFile(path.join(cwd, 'worker/.dev.vars'), `MEDICINES_WORKER_SECRET=${secret}\n`)
  const fakePnpm = path.join(bin, 'pnpm')
  await writeFile(
    fakePnpm,
    `#!/usr/bin/env node
const { spawn } = require('node:child_process')
const { appendFileSync, mkdirSync } = require('node:fs')
const args = process.argv.slice(2)
if (args[0] === 'exec' && args.includes('migrations')) {
  if (process.env.TEST_MIGRATION_FAIL === '1') process.exit(17)
  mkdirSync('worker/.wrangler/state', { recursive: true })
  appendFileSync('worker/.wrangler/state/migrations', 'applied\\n')
  process.exit(0)
}
if (args[0] === 'exec' || args[0] === 'dev') {
  if (args[0] === 'dev' && process.env.TEST_APP_EXIT === '1') process.exit(23)
  const port = args[0] === 'dev' ? 3000 : (args.includes('8787') ? 8787 : 3000)
  if (port === 8787 && process.env.TEST_WORKER_EXIT === '1') process.exit(29)
  const status = port === 8787 ? 401 : 200
  const code = "process.title='meddies-stack-service';require('node:http').createServer((req,res)=>{res.statusCode=" + status + ";res.end('ready')}).listen(" + port + ",'127.0.0.1')"
  const child = spawn(process.execPath, ['-e', code], { stdio: 'inherit' })
  if (args[0] === 'dev' && process.env.TEST_APP_WRAPPER_EXIT === '1') process.exit(0)
  child.on('exit', code => process.exit(code ?? 0))
}
`,
  )
  await chmod(fakePnpm, 0o755)
  const env = { PATH: `${bin}:${process.env.PATH}`, ...extra }
  t.onTestFinished(async () => {
    await run(['stop'], cwd, { PATH: `${bin}:${process.env.PATH}` })
    await rm(cwd, { recursive: true, force: true })
  })
  return { cwd, env }
}

async function canBind(port: number) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen({ host: '127.0.0.1', port }, () => server.close(() => resolve(true)))
  })
}

test(
  'status reports missing local configuration without printing secret values',
  budget({ commands: 2 }),
  async (t) => {
    const { cwd } = await fixture(t)
    await rm(path.join(cwd, '.env.local'))
    await rm(path.join(cwd, 'worker/.dev.vars'))
    const result = await run(['status'], cwd)
    assert.notEqual(result.code, 0)
    assert.match(result.output, /MEDICINES_WORKER_SECRET/)
    assert.doesNotMatch(result.output, /secret-value/)
  },
)

test(
  'start, status, repeated start, stop, and repeated stop preserve local D1 state',
  budget({ starts: 2, commands: 4 }),
  async (t) => {
    if (!(await canBind(3000)) || !(await canBind(8787))) return t.skip()
    const { cwd, env } = await fixture(t)
    const started = await run(['start'], cwd, env, startDeadline)
    assert.equal(started.code, 0, started.output)
    assert.match(started.output, /Local stack ready/)
    const repeated = await run(['start'], cwd, env, startDeadline)
    assert.equal(repeated.code, 0, repeated.output)
    assert.match(repeated.output, /Reusing stack/)
    const status = await run(['status'], cwd, env)
    assert.equal(status.code, 0, status.output)
    assert.match(status.output, /Worker ready/)
    assert.match(status.output, /App ready/)
    const stopStarted = Date.now()
    assert.equal((await run(['stop'], cwd, env)).code, 0)
    assert.ok(
      Date.now() - stopStarted < 6000,
      'normal stop should not wait for the escalation deadline',
    )
    assert.equal((await run(['stop'], cwd, env)).code, 0)
    assert.match(
      await readFile(path.join(cwd, 'worker/.wrangler/state/migrations'), 'utf8'),
      /applied/,
    )
  },
)

test(
  'migration failure reports its stage and leaves no owned runner',
  budget({ commands: 3 }),
  async (t) => {
    if (!(await canBind(3000)) || !(await canBind(8787))) return t.skip()
    const { cwd, env } = await fixture(t, { TEST_MIGRATION_FAIL: '1' })
    const result = await run(['start'], cwd, env)
    assert.notEqual(result.code, 0)
    assert.match(result.output, /failed at migration/)
    assert.match(result.output, /migration\.log/)
    assert.equal((await run(['status'], cwd, env)).code, 1)
  },
)

test(
  'early Next exit reports its stage and cleans up Worker',
  budget({ starts: 1, commands: 2 }),
  async (t) => {
    if (!(await canBind(3000)) || !(await canBind(8787))) return t.skip()
    const { cwd, env } = await fixture(t, { TEST_APP_EXIT: '1' })
    const result = await run(['start'], cwd, env, startDeadline)
    assert.notEqual(result.code, 0)
    assert.match(result.output, /failed at app/)
    assert.match(result.output, /app\.log/)
    const stopped = await run(['stop'], cwd, env)
    assert.equal(stopped.code, 0, stopped.output)
  },
)

test(
  'exited app wrapper cannot leave its service group behind',
  budget({ starts: 1, commands: 1 }),
  async (t) => {
    if (!(await canBind(3000)) || !(await canBind(8787))) return t.skip()
    const { cwd, env } = await fixture(t, { TEST_APP_WRAPPER_EXIT: '1' })
    const result = await run(['start'], cwd, env, startDeadline)
    assert.notEqual(result.code, 0)
    assert.match(result.output, /failed at app/)
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal(await canBind(3000), true)
    assert.equal(await canBind(8787), true)
  },
)

test(
  'busy unrelated port fails without changing its listener',
  budget({ commands: 2 }),
  async (t) => {
    const server = net.createServer()
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(3000, '127.0.0.1', resolve)
      })
    } catch {
      t.skip()
      return
    }
    t.onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())))
    const { cwd, env } = await fixture(t)
    const result = await run(['start'], cwd, env)
    assert.notEqual(result.code, 0)
    assert.match(result.output, /Port 3000 is occupied/)
    assert.equal(server.listening, true)
  },
)

test('stale state is explicit and stop never signals it', budget({ commands: 3 }), async (t) => {
  const { cwd, env } = await fixture(t)
  await mkdir(path.join(cwd, '.dev-stack'))
  await writeFile(
    path.join(cwd, '.dev-stack/state.json'),
    JSON.stringify({ pid: 2147483646, token: 'stale', stage: 'app' }),
  )
  const status = await run(['status'], cwd, env)
  assert.notEqual(status.code, 0)
  assert.match(status.output, /stale or ownership is ambiguous/)
  const stopped = await run(['stop'], cwd, env)
  assert.notEqual(stopped.code, 0)
  assert.match(stopped.output, /No process was signaled/)
  await access(path.join(cwd, '.dev-stack/state.json'))
})
