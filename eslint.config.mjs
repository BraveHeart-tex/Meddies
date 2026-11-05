import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier/flat'
import playwright from 'eslint-plugin-playwright'

const browserJourneys = 'tests/browser/**'

const eslintConfig = defineConfig([
  ...nextVitals,
  prettier,
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
