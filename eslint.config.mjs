import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier/flat'
import playwright from 'eslint-plugin-playwright'
import architecture from './eslint-rules/architecture.mjs'
import bannedUiWords from './eslint-rules/banned-ui-words.mjs'
import noRawDateFormat from './eslint-rules/no-raw-date-format.mjs'
import noWidthLoopTests from './eslint-rules/no-width-loop-tests.mjs'

const browserJourneys = 'tests/browser/**'
const meddies = {
  rules: {
    architecture,
    'banned-ui-words': bannedUiWords,
    'no-raw-date-format': noRawDateFormat,
    'no-width-loop-tests': noWidthLoopTests,
  },
}
const browserRestrictedImports = [
  'server-only',
  '**/server',
  '**/operations',
  '**/lib/http',
  '**/lib/medicine-storage',
]
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

// Route links keep link semantics: Base UI Button with nativeButton={false} adds role="button".
const routeLinkSyntax = {
  selector:
    "JSXAttribute[name.name='nativeButton'] > JSXExpressionContainer > Literal[value=false]",
  message: 'Render route links as <Link className={buttonVariants(...)}> instead.',
}
// "Now" comes from the server scheduling clock, so journeys can freeze it. `new Date(value)` is fine.
const wallClockMessage =
  'Do not read the wall clock. Use schedulingNow() on the server or useSchedulingClock() in the client.'
const wallClockSyntax = [
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: wallClockMessage },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: wallClockMessage,
  },
]
// Wall clock owners: the server scheduling clock, the schedule operations default, and auth,
// whose session lifetime is real time by design.
export const wallClockOwners = [
  'src/features/schedules/server.ts',
  'src/features/schedules/operations.ts',
  'src/features/auth/server.ts',
  'src/features/auth/session-boundary.tsx',
]

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    files: ['src/**/*.{ts,tsx}', 'worker/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    plugins: { meddies },
    rules: { 'meddies/architecture': 'error' },
  },
  prettier,
  {
    files: ['src/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...wallClockSyntax] },
  },
  // Module size budget. Exemptions need an inline disable with a reason.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }] },
  },
  {
    files: ['src/**/*.tsx'],
    rules: { 'no-restricted-syntax': ['error', routeLinkSyntax, ...wallClockSyntax] },
  },
  {
    files: wallClockOwners,
    rules: { 'no-restricted-syntax': ['error', routeLinkSyntax] },
  },
  // Internal words stay out of visible copy (docs/copy.md).
  {
    files: ['src/**/*.tsx'],
    plugins: { meddies },
    rules: { 'meddies/banned-ui-words': 'error' },
  },
  // Every UI date and time comes from the central date module (docs/copy.md).
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/calendar-date.ts'],
    plugins: { meddies },
    rules: { 'meddies/no-raw-date-format': 'error' },
  },
  // Browser code reads through authenticated API routes, never server wiring or storage transport.
  {
    files: [
      'src/components/**/*.{ts,tsx}',
      'src/features/**/*.tsx',
      'src/features/*/queries.ts',
      'src/lib/session-query-client.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: browserRestrictedImports }],
    },
  },
  // Server prefetch imports feature query keys and options, so they stay usable in Server
  // Components: no client-only React hooks (next build rejects them, lint says so first).
  {
    files: ['src/features/*/queries.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: browserRestrictedImports,
          paths: [
            {
              name: 'react',
              importNames: [
                'useState',
                'useEffect',
                'useLayoutEffect',
                'useReducer',
                'useRef',
                'useSyncExternalStore',
                'useTransition',
                'useOptimistic',
              ],
              message: 'Server prefetch imports this module; put client hooks in a .tsx file.',
            },
          ],
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
    plugins: { ...playwright.configs['flat/recommended'].plugins, meddies },
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // Width variants never earn a journey; exceptions need an inline disable with a reason.
      'meddies/no-width-loop-tests': 'error',
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
    '.cache/**',
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
