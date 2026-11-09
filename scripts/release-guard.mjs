import { execFileSync } from 'node:child_process'

const [released, current] = process.argv.slice(2)
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })

try {
  if (![released, current].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? ''))) {
    throw new Error('Expected two full commit SHAs')
  }
  git('merge-base', '--is-ancestor', released, current)
  const commits = git('rev-list', `${released}..${current}`).trim().split('\n').filter(Boolean)
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
    if (paths.some((path) => !path.startsWith('docs/') && !path.endsWith('.md'))) {
      throw new Error(`Non-docs changes in ${commit}`)
    }
  }
  console.log(
    `Release ${released} allowed at main ${current}: only docs changed since release SHA.`,
  )
} catch (error) {
  console.error(`Release refused: ${error.message}`)
  process.exitCode = 1
}
