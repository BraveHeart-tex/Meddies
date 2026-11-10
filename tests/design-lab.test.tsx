import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { designFrames } from '../src/features/design-lab/frames'

vi.mock('next/navigation', () => ({
  usePathname: () => '/lab/649-l1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
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

test('649·L1 renders the cold launch with one status and the real navigation', () => {
  const frame = designFrames.find((entry) => entry.slug === '649-l1')!
  render(frame.render())
  expect(frame.citation).toBe('649·L1')
  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(screen.getByRole('status')).toHaveTextContent('Opening Meddies')
  expect(screen.getAllByRole('main')).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  expect(screen.getAllByRole('navigation', { name: 'Primary' })).toHaveLength(1)
  for (const name of ['Today', 'Medications', 'History'])
    expect(screen.getByRole('link', { name })).toBeInTheDocument()
})
