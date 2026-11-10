import { appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const [released, current, mode] = process.argv.slice(2)
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })

try {
  if (![released, current].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? ''))) {
    throw new Error('Expected two full commit SHAs')
  }
  git('merge-base', '--is-ancestor', released, current)
  const commits = git('rev-list', `${released}..${current}`).trim().split('\n').filter(Boolean)
  let eligible = true
  for (const commit of commits) {
    const paths = git(
      'diff-tree',
      '-m',
      '-r',
      '--no-renames',
      '--no-commit-id',
      '--name-only',
      '-z',
      commit,
    )
      .split('\0')
      .filter(Boolean)
    if (
      paths.some(
        (path) =>
          !path.startsWith('docs/') &&
          !path.endsWith('.md') &&
          !path.startsWith('.agents/skills/meddies-design/'),
      )
    ) {
      if (mode !== '--early') throw new Error(`Runtime changes in ${commit}`)
      eligible = false
      break
    }
  }
  if (mode === '--early') {
    appendFileSync(process.env.GITHUB_OUTPUT, `eligible=${eligible}\n`)
    console.log(
      `Verify ${released}: ${eligible ? 'eligible' : 'skipped - superseded by code changes'}`,
    )
  } else
    console.log(
      `Release ${released} allowed at main ${current}: only non-runtime files changed since release SHA.`,
    )
} catch (error) {
  console.error(`Release refused: ${error.message}`)
  process.exitCode = 1
}
