import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier/flat'
import playwright from 'eslint-plugin-playwright'

const browserJourneys = 'tests/browser/**'
const workerRestrictedImports = [
  'next',
  'next/**',
  'node:*',
  'react',
  'react/**',
  'server-only',
  '**/server',
  '**/operations',
  '**/components/**',
  '**/lib/http',
  '**/lib/medicine-storage',
]

const eslintConfig = defineConfig([
  ...nextVitals,
  prettier,
  // Route links keep link semantics: Base UI Button with nativeButton={false} adds role="button".
  {
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXAttribute[name.name='nativeButton'] > JSXExpressionContainer > Literal[value=false]",
          message: 'Render route links as <Link className={buttonVariants(...)}> instead.',
        },
      ],
    },
  },
  // Worker code may consume neutral contracts/rules, never app wiring or browser policy.
  {
    files: ['worker/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: workerRestrictedImports }] },
  },
  {
    files: ['worker/http.ts', 'worker/commands.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...workerRestrictedImports,
            'drizzle-orm',
            'drizzle-orm/**',
            '**/schema',
            '**/doses/**',
            './medicines',
            './schedules',
          ],
        },
      ],
    },
  },
  // Browser journeys: role-first locators, web-first assertions, no fixed waits.
  {
    ...playwright.configs['flat/recommended'],
    files: [browserJourneys],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // Playwright fixtures call `use`, which is not a React hook.
      'react-hooks/rules-of-hooks': 'off',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-wait-for-selector': 'error',
      'playwright/no-eval': 'error',
      'playwright/no-element-handle': 'error',
      // Raw CSS selectors live in locators.ts as named domain locators.
      'playwright/no-raw-locators': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name=/^(evaluate|evaluateHandle|evaluateAll)$/]',
          message:
            'Use a user-facing API, or add a commented escape hatch to tests/browser/actions.ts.',
        },
      ],
    },
  },
  { files: ['tests/browser/locators.ts'], rules: { 'playwright/no-raw-locators': 'off' } },
  { files: ['tests/browser/actions.ts'], rules: { 'no-restricted-syntax': 'off' } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    '.worker-build/**',
    '.browser-artifacts/**',
    '.impeccable',
    // Design references run outside the production application.
    '.agents/skills/meddies-design/**',
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'experiments/**',
  ]),
])

export default eslintConfig
