import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ESLint } from 'eslint'

const eslint = new ESLint({ allowInlineConfig: false })
async function rejected(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath })
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages))
  return result.messages.some((message) => message.ruleId === 'meddies/architecture')
}

test('routes reject raw senders through aliases, relative paths and explicit extensions', async () => {
  for (const source of [
    '@/features/medicines/server',
    '../features/medicines/server.ts',
    '@/features/medicines/server.tsx',
  ]) {
    assert.equal(
      await rejected('src/app/example.tsx', `import { send as raw } from '${source}'`),
      true,
    )
  }
})

test('forbidden directions survive re-exports, dynamic imports and helper names', async () => {
  const cases = [
    ['src/features/medicines/contract.tsx', "export * from '@/features/auth/server.ts'"],
    ['src/features/schedules/operations.tsx', "await import('@/lib/medicine-storage.ts')"],
    ['src/features/new-helper.ts', "export { send as bypass } from '@/features/schedules/server'"],
    ['src/features/new-helper.tsx', "import * as gateway from '@/features/schedules/server'"],
    ['src/lib/new-helper.ts', "import { sendStorage } from './medicine-storage.ts'"],
    ['src/features/medicines/contract.ts', "import type { NextRequest } from 'next/server'"],
    ['src/lib/application-error.ts', "import 'node:fs'"],
    ['src/features/medicines/operations.ts', 'export const secret = process.env.SECRET'],
    ['worker/new-helper.tsx', "export * from '../src/features/schedules/queries'"],
    ['worker/http.ts', "await import('./medicines.ts')"],
    ['worker/commands.tsx', "export * from './doses/queries'"],
    ['src/app/api/new/route.tsx', "import { parseMedicine } from '@/features/medicines/contract'"],
    ['src/features/medicines/contract.ts', 'await import(variable)'],
    ['src/app/page.tsx', "import { drizzle } from 'drizzle-orm/d1'"],
    ['src/app/page.tsx', "export * from '../../worker/medicines'"],
    ['src/features/new-helper.ts', "import raw = require('@/features/medicines/server')"],
    ['src/app/api/other/route.ts', "import { requireUser } from '@/features/auth/server'"],
    ['src/app/api/auth/helper.ts', "import { parseMedicine } from '@/features/medicines/contract'"],
    ['src/features/other/server.ts', 'export const value = 1'],
  ]
  for (const [file, code] of cases)
    assert.equal(await rejected(file, code), true, `${file}: ${code}`)
})

test('legitimate neutral, injected, auth, session and prefetch dependencies stay allowed', async () => {
  const cases = [
    [
      'src/features/schedules/contract.ts',
      "export { istanbulDate } from '../../lib/calendar-date.ts'",
    ],
    ['src/features/schedules/operations.ts', "import { scheduleToday } from './occurrences'"],
    ['worker/commands.ts', "import { parseMedicine } from '../src/features/medicines/contract'"],
    [
      'worker/doses/queries.ts',
      "import { scheduledInstant } from '../../src/features/schedules/occurrences'",
    ],
    ['src/features/auth/server.ts', "import 'server-only'; import NextAuth from 'next-auth'"],
    [
      'src/app/api/auth/[...nextauth]/route.ts',
      "import { handlers } from '@/features/auth/server'",
    ],
    ['src/app/api/session/route.ts', "import { requireUser } from '@/features/auth/server'"],
    [
      'src/features/schedules/prefetch.ts',
      "import 'server-only'; import { scheduleSnapshotQuery } from './queries'; import { schedules } from './server'",
    ],
    ['tests/gateway.test.ts', "import { send } from '../src/features/medicines/server'"],
    ['tests/gateway.test.ts', "import { send } from '../src/features/schedules/server'"],
    ['src/app/page.tsx', "import { medicines } from '@/features/medicines/server'"],
    ['src/app/api/medicines/route.ts', "import { medicines } from '@/features/medicines/server'"],
  ]
  for (const [file, code] of cases)
    assert.equal(await rejected(file, code), false, `${file}: ${code}`)
})

test('the non-suppressible architecture pass ignores inline disables', async () => {
  for (const directive of [
    'eslint-disable',
    'eslint-disable meddies/architecture',
    'eslint-disable-next-line meddies/architecture',
  ])
    assert.equal(
      await rejected(
        'src/app/page.tsx',
        `/* ${directive} */\nimport { send } from '@/features/medicines/server'`,
      ),
      true,
    )
})

test('server-only markers cannot be removed from wiring or composition', async () => {
  for (const file of [
    'src/lib/medicine-storage.ts',
    'src/features/medicines/server.ts',
    'src/features/schedules/server.ts',
    'src/features/auth/server.ts',
    'src/features/schedules/prefetch.ts',
  ]) {
    assert.equal(await rejected(file, 'export const value = 1'), true, file)
    assert.equal(await rejected(file, "import 'server-only'; export const value = 1"), false, file)
  }
})
