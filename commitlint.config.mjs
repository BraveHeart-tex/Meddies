const config = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        // GitHub issue (#123); legacy Linear IDs (FE-123) stay valid for reverts and history
        'issue-scope': ({ scope }) => {
          const valid = /^(#[1-9]\d*|FE-[1-9]\d*)$/.test(scope ?? '')

          return [valid, 'Commit scope must be a GitHub issue number (e.g. #123)']
        },
      },
    },
  ],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'chore',
        'style',
        'refactor',
        'ci',
        'test',
        'revert',
        'perf',
        'security',
      ],
    ],
    'scope-empty': [2, 'never'],
    'scope-case': [0],
    'issue-scope': [2, 'always'],
  },
}

export default config
