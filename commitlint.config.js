const config = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'linear-issue-scope': ({ scope }) => {
          const valid = /^FE-[1-9]\d*$/.test(scope ?? '')

          return [valid, 'Commit scope must be a Linear issue ID (e.g. FE-123)']
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
    'linear-issue-scope': [2, 'always'],
  },
}

export default config
