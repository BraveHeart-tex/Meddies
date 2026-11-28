import { spawnSync } from 'node:child_process'
import { withNextOutputLock } from './next-output-lock.mjs'
import { productionBuild } from './production-build.mjs'

function runPnpm(args, env = process.env) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env })
  if (result.error) throw result.error
  if (result.signal) throw new Error(`pnpm ${args.join(' ')} terminated by ${result.signal}`)
  return result.status
}

const root = process.cwd()
try {
  if (process.argv.length > 2) throw new Error('Usage: pnpm lab:check')
  const httpStatus = await withNextOutputLock({ root, owner: 'pnpm lab:check' }, async (env) => {
    const build = await productionBuild({
      root,
      env,
      run: (_command, args) => {
        const status = runPnpm(args, env)
        if (status !== 0) throw new Error(`pnpm ${args.join(' ')} exited with status ${status}`)
      },
    })
    console.log(build)
    return runPnpm(
      ['exec', 'vitest', 'run', '--project', 'integration', 'tests/design-lab-http.test.ts'],
      env,
    )
  })
  const citationStatus = runPnpm([
    'exec',
    'vitest',
    'run',
    '--project',
    'unit',
    'tests/design-citations.test.ts',
  ])
  process.exitCode = httpStatus || citationStatus
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
