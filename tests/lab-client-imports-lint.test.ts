import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ESLint } from 'eslint'

const eslint = new ESLint()
const frames = 'src/features/design-lab/approved/example-frames.tsx'

async function labErrors(code: string, filePath = frames) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((message) =>
    /Lab frames render on the server/.test(message.message),
  ).length
}

test('a frame file may not take plain values from a client module', async () => {
  assert.equal(await labErrors("import { fixtureQueryClient } from '../fixture-query'\n"), 1)
  assert.equal(await labErrors("import { useKnownOffline } from '@/lib/use-known-offline'\n"), 1)
  assert.equal(await labErrors("import * as fixtures from '../fixture-query'\n"), 1)
  assert.equal(
    await labErrors("import { DoseDrawer, TODAY } from '@/features/schedules/dose-drawer'\n"),
    1,
  )
})

test('components and types from client modules stay allowed', async () => {
  assert.equal(
    await labErrors("import { FixtureQuery, type QueryFixtures } from '../fixture-query'\n"),
    0,
  )
  assert.equal(await labErrors("import type { QueryFixtures } from '../fixture-query'\n"), 0)
  assert.equal(
    await labErrors("import { DoseDrawer } from '@/features/schedules/dose-drawer'\n"),
    0,
  )
})

test('values from server-safe modules and other files stay allowed', async () => {
  assert.equal(await labErrors("import { TODAY, magnesium } from '../lab-fixtures'\n"), 0)
  const other = 'src/features/design-lab/approved/example-drawers.tsx'
  assert.equal(await labErrors("import { fixtureQueryClient } from '../fixture-query'\n", other), 0)
  assert.equal(
    await labErrors(
      "import { fixtureQueryClient } from './fixture-query'\n",
      'src/features/design-lab/frames.tsx',
    ),
    1,
  )
  for (const folder of ['draft', 'built'])
    assert.equal(
      await labErrors(
        "import { fixtureQueryClient } from '../fixture-query'\n",
        `src/features/design-lab/${folder}/frames.tsx`,
      ),
      1,
    )
})
