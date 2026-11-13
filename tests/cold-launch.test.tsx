import { render, screen, within } from '@testing-library/react'
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

test('cold launch shows four tabs and a header skeleton without Settings', () => {
  render(<Loading />)

  const nav = screen.getByRole('navigation', { name: 'Primary' })
  expect(
    within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent),
  ).toEqual(['Today', 'Medications', 'History', 'Settings'])
  // The Settings tab is the only Settings link: the header skeleton has none.
  expect(screen.getAllByRole('link', { name: 'Settings' })).toHaveLength(1)
  expect(screen.queryByRole('heading')).toBeNull()
})
