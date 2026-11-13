import { act, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { builtFrames } from '../src/features/design-lab/built/frames'
import { designCriticalScreens, designFrames } from '../src/features/design-lab/frames'
import { outline } from './helpers/outline'

vi.mock('next/navigation', () => ({
  usePathname: () => '/lab',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => vi.restoreAllMocks())

test('each design-critical screen has exactly one built frame', () => {
  for (const screen of designCriticalScreens)
    expect(
      builtFrames.filter(({ title }) => title === screen),
      screen,
    ).toHaveLength(1)
  expect(designFrames.filter(({ status }) => status === 'built')).toHaveLength(
    designCriticalScreens.length,
  )
})

// Outlines catch copy and structure changes in the production screens a built frame renders.
// After an intended change, review the diff and update with `pnpm exec vitest run -u <this file>`.
test.each(builtFrames.map((frame) => [frame.citation, frame] as const))(
  '%s matches its outline and reads nothing from the network',
  async (_citation, frame) => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const { container } = render(frame.render())
    // Let mount reads, if any, start.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(fetch).not.toHaveBeenCalled()
    await expect(outline(container)).toMatchFileSnapshot(`./outlines/${frame.slug}.txt`)
  },
)
