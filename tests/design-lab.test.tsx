import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { designFrames } from '../src/features/design-lab/frames'

vi.mock('next/navigation', () => ({ usePathname: () => '/lab/649-l1' }))

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
