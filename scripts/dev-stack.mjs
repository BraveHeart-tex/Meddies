#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { readFile, mkdir, writeFile, rm, open, realpath, rename } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const root = await realpath(process.cwd())
const stateDir = path.join(root, '.dev-stack')
const stateFile = path.join(stateDir, 'state.json')
const lockDir = path.join(stateDir, 'lock')
const appUrl = 'http://127.0.0.1:3000'
const workerUrl = 'http://127.0.0.1:8787'
const action = process.argv[2]
const runnerToken = process.argv[3]
const isRunner = action === 'run'

function fail(message) {
  console.error(message)
  process.exitCode = 1
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
async function loadState() {
  try {
    return { present: true, value: JSON.parse(await readFile(stateFile, 'utf8')) }
  } catch (error) {
    if (error.code === 'ENOENT') return { present: false, value: null }
    return { present: true, value: null }
  }
}
async function saveState(state) {
  const temp = `${stateFile}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 })
  await rename(temp, stateFile)
}
async function withLock(fn) {
  await mkdir(stateDir, { recursive: true, mode: 0o700 })
  try {
    await mkdir(lockDir, { mode: 0o700 })
  } catch {
    let owner = 'unknown owner'
    try {
      owner = (await readFile(path.join(lockDir, 'owner'), 'utf8')).trim()
    } catch {}
    const pid = Number(owner)
    let hint = 'owner is unknown'
    if (Number.isSafeInteger(pid) && pid > 1) {
      try {
        process.kill(pid, 0)
        hint = `owner PID ${pid} is active`
      } catch {
        hint = `owner PID ${pid} is gone; lock is stale`
      }
    }
    throw Error(`Lifecycle lock exists (${hint}). If stale, remove .dev-stack/lock and retry.`)
  }
  await writeFile(path.join(lockDir, 'owner'), `${process.pid}\n`, { mode: 0o600 })
  try {
    return await fn()
  } finally {
    await rm(lockDir, { recursive: true, force: true })
  }
}
async function probe(url, expected) {
  let response
  try {
    response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(800) })
  } catch (error) {
    return { ok: false, status: null, error: error.name }
  }
  const result = { ok: response.status === expected, status: response.status, expected }
  await response.body?.cancel().catch(() => {})
  return result
}
async function checkPort(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', (error) => resolve({ available: false, code: error.code || 'UNKNOWN' }))
    server.listen({ host: '127.0.0.1', port }, () =>
      server.close(() => resolve({ available: true })),
    )
  })
}
async function localConfig() {
  let app = {},
    worker = {}
  try {
    app = parseEnv(await readFile(path.join(root, '.env.local'), 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  try {
    worker = parseEnv(await readFile(path.join(root, 'worker/.dev.vars'), 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const secret = app.MEDICINES_WORKER_SECRET
  if (!secret || secret.length < 32 || secret.startsWith('replace-with-'))
    throw Error(
      'Set MEDICINES_WORKER_SECRET to the same independent value (at least 32 characters) in .env.local and worker/.dev.vars.',
    )
  if (worker.MEDICINES_WORKER_SECRET !== secret)
    throw Error('MEDICINES_WORKER_SECRET must match in .env.local and worker/.dev.vars.')
  return {
    secret,
    appEnv: { MEDICINES_WORKER_SECRET: secret, MEDICINES_WORKER_URL: workerUrl },
    workerEnv: { MEDICINES_WORKER_SECRET: secret },
  }
}
function inspectOwned(state) {
  if (
    !state ||
    !Number.isSafeInteger(state.pid) ||
    state.pid < 2 ||
    typeof state.token !== 'string' ||
    !state.token
  )
    return false
  try {
    process.kill(state.pid, 0)
    const row = execFileSync('ps', ['-o', 'pid=,pgid=,command=', '-p', String(state.pid)], {
      encoding: 'utf8',
    }).trim()
    const match = row.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)
    return (
      Boolean(match) &&
      Number(match[1]) === state.pid &&
      Number(match[2]) === state.pid &&
      match[3].includes(scriptPath) &&
      match[3].includes(`run ${state.token}`)
    )
  } catch {
    return false
  }
}
function validState(result) {
  return (
    result.present &&
    result.value &&
    typeof result.value === 'object' &&
    Number.isSafeInteger(result.value.pid) &&
    typeof result.value.token === 'string'
  )
}
function showState(state) {
  console.log(
    `Stage: ${state.stage || 'starting'}${state.stageDetail ? ` (${state.stageDetail})` : ''}`,
  )
  console.log(
    `Migration: ${state.migration?.summary || 'pending'}${state.logs?.migration ? ` - ${state.logs.migration}` : ''}`,
  )
  console.log(
    `Worker: ${state.worker?.summary || 'pending'}${state.logs?.worker ? ` - ${state.logs.worker}` : ''}`,
  )
  console.log(
    `App: ${state.app?.summary || 'pending'}${state.logs?.app ? ` - ${state.logs.app}` : ''}`,
  )
}
async function report() {
  const loaded = await loadState()
  if (!loaded.present) {
    console.log('No local stack state.')
    try {
      await localConfig()
    } catch (error) {
      console.log(`Configuration: invalid (${error.message})`)
    }
    return false
  }
  if (!validState(loaded)) {
    console.log(
      'Lifecycle state is malformed or ambiguous. No process was signaled. Inspect .dev-stack/state.json.',
    )
    return false
  }
  const state = loaded.value
  if (!inspectOwned(state)) {
    console.log('Lifecycle state is stale or ownership is ambiguous. No process was signaled.')
    showState(state)
    return false
  }
  const worker = await probe(`${workerUrl}/medicines`, 401)
  const app = await probe(`${appUrl}/`, 200)
  const workerReady = state.ready && state.worker?.probe?.ok && worker.ok
  const appReady = state.ready && state.app?.probe?.ok && app.ok
  console.log(
    `Worker ${workerReady ? 'ready' : 'not ready'}: ${workerUrl} (GET /medicines -> ${worker.status ?? worker.error})`,
  )
  console.log(
    `App ${appReady ? 'ready' : 'not ready'}: ${appUrl} (GET / -> ${app.status ?? app.error})`,
  )
  showState(state)
  return Boolean(workerReady && appReady)
}
async function signalOwned(state, signal) {
  if (!inspectOwned(state))
    throw Error('Stack ownership could not be verified. No process was signaled.')
  process.kill(-state.pid, signal)
}
async function stopOwned(state, timeout = 10000) {
  await signalOwned(state, 'SIGTERM')
  let deadline = Date.now() + timeout
  while (Date.now() < deadline && inspectOwned(state)) await sleep(200)
  if (inspectOwned(state)) {
    await signalOwned(state, 'SIGKILL')
    deadline = Date.now() + 2000
    while (Date.now() < deadline && inspectOwned(state)) await sleep(100)
  }
  if (inspectOwned(state))
    throw Error(
      `Verified stack group remained after SIGTERM and SIGKILL. Logs: ${state.logs?.runner}`,
    )
}
function serviceGroupMembers(group) {
  if (!Number.isSafeInteger(group) || group < 2) return []
  try {
    return execFileSync('ps', ['-axo', 'pid=,pgid=,command='], { encoding: 'utf8' })
      .split('\n')
      .map((row) => row.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/))
      .filter((match) => match && Number(match[2]) === group)
  } catch {
    return []
  }
}
function signalServiceGroup(group, service, signal) {
  const members = serviceGroupMembers(group)
  const signature = {
    migration: /pnpm|wrangler.*migrations|meddies-stack-service/,
    worker: /pnpm|wrangler.*dev|meddies-stack-service/,
    app: /pnpm|next.*dev|meddies-stack-service/,
  }[service]
  if (!members.some((member) => Number(member[1]) === group || signature.test(member[3])))
    return false
  try {
    process.kill(-group, signal)
    return true
  } catch {
    return false
  }
}
async function start() {
  await withLock(async () => {
    const config = await localConfig()
    const loaded = await loadState()
    if (loaded.present) {
      if (!validState(loaded))
        throw Error(
          'Stale or malformed lifecycle state. No process was signaled. Inspect .dev-stack/state.json.',
        )
      if (!inspectOwned(loaded.value))
        throw Error(
          'Stale or ambiguous lifecycle state. No process was signaled. Inspect state and logs before removing it.',
        )
      if (await report()) {
        console.log(`Reusing stack. Logs: ${loaded.value.logs.runner}`)
        return
      }
      throw Error(
        'Owned stack is unhealthy or still starting. Run status, then stop if it cannot recover.',
      )
    }
    for (const port of [3000, 8787]) {
      const result = await checkPort(port)
      if (!result.available) {
        if (result.code === 'EADDRINUSE')
          throw Error(
            `Port ${port} is occupied. Stop its owner and retry; unrelated listeners are never terminated.`,
          )
        throw Error(`Cannot check port ${port} (${result.code}). No processes were started.`)
      }
    }
    const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const logs = Object.fromEntries(
      ['runner', 'migration', 'worker', 'app'].map((name) => [
        name,
        path.join(stateDir, `${name}.log`),
      ]),
    )
    const logStream = await open(logs.runner, 'a', 0o600)
    const child = spawn(process.execPath, [scriptPath, 'run', token], {
      cwd: root,
      env: { ...process.env, MEDDIES_STACK_TOKEN: token },
      detached: true,
      stdio: ['ignore', logStream.fd, logStream.fd, 'ipc'],
    })
    await logStream.close()
    const state = {
      pid: child.pid,
      token,
      root,
      logs,
      startedAt: new Date().toISOString(),
      stage: 'handshake',
      ready: false,
    }
    await saveState(state)
    child.unref()
    child.channel?.unref()
    let flushStateWrites = Promise.resolve()
    let finishStartup
    const onInterrupt = (signal) => finishStartup({ ready: false, interrupted: signal })
    const outcome = await new Promise((resolve, reject) => {
      let settled = false
      let currentState = state
      let stateWrites = Promise.resolve()
      const finish = (value) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(value)
        }
      }
      finishStartup = finish
      child.on('message', (message) => {
        if (message?.state) {
          currentState = { ...currentState, ...message.state }
          stateWrites = stateWrites.then(() => saveState(currentState))
          flushStateWrites = stateWrites
        }
        if (message?.type === 'ready')
          void stateWrites.then(() => finish({ ready: true, state: message.state }), reject)
        if (message?.type === 'failure')
          void stateWrites.then(() => finish({ ready: false, state: message.state }), reject)
      })
      child.once('error', reject)
      child.once('exit', (code, signal) => finish({ ready: false, code, signal }))
      process.once('SIGINT', onInterrupt)
      process.once('SIGTERM', onInterrupt)
      const timer = setTimeout(() => finish({ ready: false, timeout: true }), 205000)
      child.send({ type: 'go' })
    })
    await flushStateWrites
    process.removeListener('SIGINT', onInterrupt)
    process.removeListener('SIGTERM', onInterrupt)
    if (!outcome.ready) {
      const current = (await loadState()).value || state
      if (inspectOwned(current)) await stopOwned(current)
      const failure = outcome.state || current
      await rm(stateFile, { force: true })
      throw Error(
        `Stack startup failed at ${failure.stage || 'runner'}${failure.stageDetail ? `: ${failure.stageDetail}` : ''}${outcome.interrupted ? ` (interrupted by ${outcome.interrupted})` : outcome.timeout ? ' (startup timed out)' : ` (exit ${outcome.code ?? 'unknown'}${outcome.signal ? `, signal ${outcome.signal}` : ''})`}. Last probe: ${failure.worker?.probe ? `Worker ${failure.worker.probe.status ?? failure.worker.probe.error}` : ''}${failure.app?.probe ? ` App ${failure.app.probe.status ?? failure.app.probe.error}` : ''}. Logs: ${Object.values(logs).join(', ')}`,
      )
    }
    console.log(
      `Local stack ready. App: ${appUrl}; Worker: ${workerUrl}; logs: ${Object.values(logs).join(', ')}`,
    )
  })
}
async function runStack() {
  if (process.env.MEDDIES_STACK_TOKEN !== runnerToken) process.exit(2)
  await new Promise((resolve) =>
    process.once('message', (message) => message?.type === 'go' && resolve()),
  )
  const owned = (await loadState()).value
  if (owned?.token !== runnerToken || owned.pid !== process.pid) process.exit(2)
  let stopping = false
  let stage = 'configuration'
  const children = new Set()
  const update = (patch, type = 'state') => {
    stageState = { ...stageState, ...patch }
    try {
      if (process.send)
        return new Promise((resolve) => process.send({ type, state: stageState }, resolve))
    } catch {}
    return Promise.resolve()
  }
  let stageState = {
    ...owned,
    stage,
    ready: false,
    migration: { summary: 'pending' },
    worker: { summary: 'pending' },
    app: { summary: 'pending' },
  }
  const config = await localConfig()
  const cleanup = async (reason) => {
    if (stopping) return
    stopping = true
    for (const child of children) signalServiceGroup(child.pid, child.stackName, 'SIGTERM')
    let cleanupTimer
    const timeout = new Promise((resolve) => {
      cleanupTimer = setTimeout(resolve, 2000)
    })
    await Promise.race([
      Promise.all(
        [...children].map((child) =>
          child.exitCode !== null || child.signalCode
            ? Promise.resolve()
            : new Promise((resolve) => child.once('close', resolve)),
        ),
      ),
      timeout,
    ])
    // Successful cleanup must not keep the runner alive until the escalation deadline.
    clearTimeout(cleanupTimer)
    for (const child of children) signalServiceGroup(child.pid, child.stackName, 'SIGKILL')
    await update({ stage, stageDetail: reason, ready: false }, 'failure')
    if (process.connected) process.disconnect()
    process.exitCode = 1
  }
  process.on('SIGTERM', () => void cleanup('received SIGTERM'))
  process.on('SIGINT', () => void cleanup('received SIGINT'))
  process.on('disconnect', () => {
    if (stage !== 'ready') void cleanup('parent disconnected')
  })
  const launch = async (name, command, args, env, allowExit = false) => {
    const log = await open(owned.logs[name], 'a', 0o600)
    const child = spawn(command, args, {
      cwd: root,
      env,
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
    })
    child.stackName = name
    await log.close()
    children.add(child)
    child.on('error', (error) => {
      update({ stage, stageDetail: `${name} spawn error: ${error.code || error.name}` })
      void cleanup(`${name} spawn error`)
    })
    child.once('close', (code, signal) => {
      if (!stopping && !allowExit)
        void cleanup(`${name} exited with code ${code ?? 'null'}, signal ${signal || 'none'}`)
    })
    return child
  }
  const awaitChild = (child) =>
    new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })))
  try {
    stage = 'migration'
    update({ stage })
    const migration = await launch(
      'migration',
      'pnpm',
      [
        'exec',
        'wrangler',
        'd1',
        'migrations',
        'apply',
        'DB',
        '--local',
        '--config',
        'worker/wrangler.jsonc',
      ],
      { ...process.env, ...config.workerEnv },
      true,
    )
    let migrationTimedOut = false
    const migrationTimer = setTimeout(() => {
      migrationTimedOut = true
      update({ stageDetail: 'migration timed out after 60 seconds' })
      try {
        process.kill(-migration.pid, 'SIGTERM')
      } catch {}
      setTimeout(() => {
        try {
          process.kill(-migration.pid, 'SIGKILL')
        } catch {}
      }, 2000).unref()
    }, 60000)
    const migrationResult = await awaitChild(migration)
    clearTimeout(migrationTimer)
    children.delete(migration)
    if (stopping) return
    if (migrationTimedOut) return cleanup('migration timed out after 60 seconds')
    if (migrationResult.code !== 0)
      return cleanup(
        `migration exited with code ${migrationResult.code ?? 'null'}, signal ${migrationResult.signal || 'none'}`,
      )
    stage = 'worker'
    update({ migration: { summary: 'succeeded' }, stage })
    const workerChild = await launch(
      'worker',
      'pnpm',
      [
        'exec',
        'wrangler',
        'dev',
        '--local',
        '--ip',
        '127.0.0.1',
        '--port',
        '8787',
        '--config',
        'worker/wrangler.jsonc',
      ],
      { ...process.env, ...config.workerEnv },
    )
    const workerDeadline = Date.now() + 45000
    let workerProbe = { ok: false, status: null, error: 'timeout' }
    while (Date.now() < workerDeadline && !stopping) {
      workerProbe = await probe(`${workerUrl}/medicines`, 401)
      update({ worker: { summary: workerProbe.ok ? 'ready' : 'waiting', probe: workerProbe } })
      if (workerProbe.ok) break
      if (workerChild.exitCode !== null || workerChild.signalCode)
        return cleanup(
          `Worker exited with code ${workerChild.exitCode ?? 'null'}, signal ${workerChild.signalCode || 'none'}; probe HTTP ${workerProbe.status ?? workerProbe.error}`,
        )
      await sleep(1000)
    }
    if (!workerProbe.ok)
      return cleanup(
        `Worker readiness timed out; last probe HTTP ${workerProbe.status ?? workerProbe.error}`,
      )
    stage = 'app'
    update({ worker: { summary: 'ready', probe: workerProbe }, stage })
    const appEnv = { ...process.env, ...config.appEnv }
    const appChild = await launch(
      'app',
      'pnpm',
      ['dev', '--hostname', '127.0.0.1', '--port', '3000'],
      appEnv,
    )
    const appDeadline = Date.now() + 90000
    let appProbe = { ok: false, status: null, error: 'timeout' }
    while (Date.now() < appDeadline && !stopping) {
      appProbe = await probe(`${appUrl}/`, 200)
      update({ app: { summary: appProbe.ok ? 'ready' : 'waiting', probe: appProbe } })
      if (appProbe.ok) break
      if (appChild.exitCode !== null || appChild.signalCode)
        return cleanup(
          `App exited with code ${appChild.exitCode ?? 'null'}, signal ${appChild.signalCode || 'none'}; probe HTTP ${appProbe.status ?? appProbe.error}`,
        )
      await sleep(1000)
    }
    if (!appProbe.ok)
      return cleanup(
        `App readiness timed out; last probe HTTP ${appProbe.status ?? appProbe.error}`,
      )
    stage = 'ready'
    await update({ app: { summary: 'ready', probe: appProbe }, stage, ready: true }, 'ready')
  } catch (error) {
    return cleanup(`${stage} failure: ${error.code || error.name}`)
  }
}
async function stop() {
  await withLock(async () => {
    const loaded = await loadState()
    if (!loaded.present) {
      console.log('Local stack is stopped.')
      return
    }
    if (!validState(loaded))
      throw Error(
        'Malformed lifecycle state is ambiguous. No process was signaled. Inspect .dev-stack/state.json.',
      )
    const state = loaded.value
    if (!inspectOwned(state))
      throw Error(
        'Stale or ambiguous lifecycle state found. No process was signaled. Inspect state and logs before removing it.',
      )
    await stopOwned(state)
    await rm(stateFile, { force: true })
    console.log(`Local stack stopped. Logs: ${Object.values(state.logs || {}).join(', ')}`)
  })
}
try {
  if (isRunner) await runStack()
  else if (action === 'start') await start()
  else if (action === 'status')
    await withLock(async () => {
      if (!(await report())) process.exitCode = 1
    })
  else if (action === 'stop') await stop()
  else {
    console.error('Usage: pnpm dev:stack <start|status|stop>')
    process.exitCode = 2
  }
} catch (error) {
  fail(error.message)
}
