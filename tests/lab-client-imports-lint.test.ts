import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ESLint } from 'eslint'

const eslint = new ESLint()
const frames = 'src/features/design-lab/example-frames.tsx'

async function labErrors(code: string, filePath = frames) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((message) =>
    /Lab frames render on the server/.test(message.message),
  ).length
}

test('a frame file may not take plain values from a client module', async () => {
  assert.equal(await labErrors("import { rowClassName } from './unscheduled-parts'\n"), 1)
  assert.equal(await labErrors("import { useScheduleEdit } from './use-schedule-edit'\n"), 1)
  assert.equal(await labErrors("import * as parts from './unscheduled-parts'\n"), 1)
  assert.equal(
    await labErrors("import { DoseDrawer, TODAY } from '@/features/schedules/dose-drawer'\n"),
    1,
  )
})

test('components and types from client modules stay allowed', async () => {
  assert.equal(
    await labErrors("import { LabToast, type SaveStep } from './unscheduled-parts'\n"),
    0,
  )
  assert.equal(await labErrors("import type { SaveStep } from './unscheduled-parts'\n"), 0)
  assert.equal(
    await labErrors("import { DoseDrawer } from '@/features/schedules/dose-drawer'\n"),
    0,
  )
})

test('values from server-safe modules and other files stay allowed', async () => {
  assert.equal(await labErrors("import { TODAY, magnesium } from './lab-fixtures'\n"), 0)
  assert.equal(await labErrors("import { savedMessage } from './unscheduled-model'\n"), 0)
  const other = 'src/features/design-lab/unscheduled-drawers.tsx'
  assert.equal(await labErrors("import { rowClassName } from './unscheduled-parts'\n", other), 0)
  assert.equal(
    await labErrors(
      "import { rowClassName } from './unscheduled-parts'\n",
      'src/features/design-lab/frames.tsx',
    ),
    1,
  )
})
