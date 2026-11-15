import { afterEach, expect, test, vi } from 'vitest'

const { launch, spawnSync } = vi.hoisted(() => ({ launch: vi.fn(), spawnSync: vi.fn() }))
vi.mock('@playwright/test', () => ({ chromium: { launch } }))
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawnSync,
}))

const argv = process.argv
const exit = new Error('command exited')
afterEach(() => {
  process.argv = argv
  vi.restoreAllMocks()
  vi.resetAllMocks()
  vi.resetModules()
})

async function capture() {
  process.argv = ['node', 'scripts/lab-capture.mjs', '109-']
  const status = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw exit
  })
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  spawnSync.mockReturnValue({ status: 0 })
  // Execute the command entry point while replacing only browser/process boundaries.
  const script = '../scripts/lab-capture.mjs'
  await expect(import(script)).rejects.toBe(exit)
  return { status, error }
}

test.each([
  "Executable doesn't exist at /cache/chromium/headless_shell",
  'error while loading shared libraries: libnspr4.so: cannot open shared object file',
])('browser setup failure stops builds and services: %s', async (details) => {
  launch.mockRejectedValue(new Error(details))
  const { status, error } = await capture()
  expect(status).toHaveBeenCalledWith(1)
  expect(spawnSync).not.toHaveBeenCalled()
  const diagnostic = error.mock.calls.flat().join('\n')
  expect(diagnostic).toContain('pnpm exec playwright install --with-deps chromium')
  expect(diagnostic).toContain(details)
})

test('successful preflight closes Chromium before continuing the existing capture flow', async () => {
  const close = vi.fn().mockResolvedValue(undefined)
  launch.mockResolvedValue({ newPage: vi.fn().mockResolvedValue({}), close })
  const { status } = await capture()
  expect(close).toHaveBeenCalledOnce()
  expect(launch).toHaveBeenCalledWith({ headless: true })
  expect(spawnSync.mock.calls.map(([command, args]) => [command, args])).toEqual([
    ['pnpm', ['worker:build']],
    [
      'pnpm',
      ['exec', 'playwright', 'test', 'browser/lab-capture', '--project=phone', '--grep=@visual'],
    ],
  ])
  expect(close.mock.invocationCallOrder[0]).toBeLessThan(spawnSync.mock.invocationCallOrder[0])
  expect(spawnSync.mock.calls[1][2].env).toMatchObject({
    MEDDIES_BROWSER_DEV: '1',
    MEDDIES_LAB_PREFIX: '109-',
  })
  expect(status).toHaveBeenCalledWith(0)
})

test('a probe failure after launch closes Chromium and stops builds and services', async () => {
  const close = vi.fn().mockResolvedValue(undefined)
  launch.mockResolvedValue({
    newPage: vi.fn().mockRejectedValue(new Error('browser disconnected')),
    close,
  })
  const { status, error } = await capture()
  expect(close).toHaveBeenCalledOnce()
  expect(status).toHaveBeenCalledWith(1)
  expect(spawnSync).not.toHaveBeenCalled()
  expect(error.mock.calls.flat().join('\n')).toContain('browser disconnected')
})
