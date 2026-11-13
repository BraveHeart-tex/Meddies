import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { approvedFrames } from '../src/features/design-lab/approved/frames'
import { builtFrames } from '../src/features/design-lab/built/frames'
import { draftFrames } from '../src/features/design-lab/draft/frames'
import { designFrames, type BuiltFrame, type LabFrame } from '../src/features/design-lab/frames'

vi.mock('next/navigation', () => ({
  usePathname: () => '/lab/109-l1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// Every registered frame renders in jsdom, so a frame needing a browser API jsdom lacks fails
// in the design ticket that adds it, not in the build ticket that reuses its parts.
test.each(designFrames.map((frame) => [frame.citation, frame] as const))(
  '%s renders',
  (_citation, frame) => {
    render(frame.render())
    expect(document.body).not.toBeEmptyDOMElement()
  },
)

test('a frame takes its status from its folder', () => {
  const folders = { draft: draftFrames, approved: approvedFrames, built: builtFrames }
  for (const [status, frames] of Object.entries(folders))
    expect(designFrames.filter((frame) => frame.status === status).map(({ slug }) => slug)).toEqual(
      frames.map(({ slug }) => slug),
    )
})

test('only built frames carry a route', () => {
  const frame = { slug: '900-a1', title: 'Today', citation: '900·A1', render: () => null } as const
  const built: BuiltFrame = { ...frame, route: '/' }
  // @ts-expect-error a draft or approved frame has no route
  const approved: LabFrame = { ...frame, route: '/' }
  // @ts-expect-error a built frame names the route it renders
  const unrouted: BuiltFrame = frame
  expect([built, approved, unrouted]).toHaveLength(3)
})

test('109·L1 renders the cold launch with one status and the real navigation', () => {
  const frame = designFrames.find((entry) => entry.slug === '109-l1')!
  render(frame.render())
  expect(frame.citation).toBe('109·L1')
  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(screen.getByRole('status')).toHaveTextContent('Opening Meddies')
  expect(screen.getAllByRole('main')).toHaveLength(1)
  expect(screen.getAllByRole('navigation', { name: 'Primary' })).toHaveLength(1)
  for (const name of ['Today', 'Medications', 'History', 'Settings'])
    expect(screen.getByRole('link', { name })).toBeInTheDocument()
})

test('238·A5 selects the Settings tab and its title stands alone', () => {
  const frame = designFrames.find((entry) => entry.slug === '238-a5')!
  render(frame.render())
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
})
