import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import Loading from '../src/app/loading'

vi.mock('next/navigation', () => ({ usePathname: () => '/history' }))

test('cold launch announces one status and keeps placeholders hidden', () => {
  const { container } = render(<Loading />)

  const statuses = screen.getAllByRole('status')
  expect(statuses).toHaveLength(1)
  expect(statuses[0]).toHaveTextContent(/^Opening Meddies$/)

  const placeholders = container.querySelectorAll('[data-slot="skeleton"]')
  expect(placeholders.length).toBeGreaterThan(0)
  for (const placeholder of placeholders) {
    expect(placeholder.closest('[aria-hidden="true"]')).not.toBeNull()
  }
})

test('cold launch keeps the real Settings button and primary navigation', () => {
  render(<Loading />)

  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  const nav = screen.getByRole('navigation', { name: 'Primary' })
  expect(nav).toBeInTheDocument()
  expect(screen.queryByRole('heading')).toBeNull()
})
