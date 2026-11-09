import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import HistoryLoading from '../src/app/history/loading'
import SettingsLoading from '../src/app/settings/loading'
import SignInErrorLoading from '../src/app/sign-in/error/loading'

const navigation = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

/** One polite status names the wait; every placeholder stays hidden from assistive technology. */
function expectOneStatus(container: HTMLElement, label: string) {
  const statuses = screen.getAllByRole('status')
  expect(statuses).toHaveLength(1)
  expect(statuses[0]).toHaveTextContent(label)
  const placeholders = container.querySelectorAll('[data-slot="skeleton"]')
  expect(placeholders.length).toBeGreaterThan(0)
  for (const placeholder of placeholders) expect(placeholder).toHaveAttribute('aria-hidden', 'true')
}

test('Settings fallback selects no tab and makes no claim about the account', () => {
  navigation.pathname = '/settings'
  const { container } = render(<SettingsLoading />)

  expectOneStatus(container, 'Opening Settings')
  expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  const primary = screen.getByRole('navigation', { name: 'Primary' })
  expect(primary.querySelector('[aria-current="page"]')).toBeNull()
  expect(container).not.toHaveTextContent(/signed in|session ends|sign out/i)
})

test('History fallback selects History and holds the date bar and results', () => {
  navigation.pathname = '/history'
  const { container } = render(<HistoryLoading />)

  expectOneStatus(container, 'Opening History')
  expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument()
  const primary = screen.getByRole('navigation', { name: 'Primary' })
  expect(primary.querySelector('[aria-current="page"]')).toHaveTextContent('History')
  // The date is unknown before the page resolves, so the date bar is not yet usable.
  expect(screen.queryByRole('navigation', { name: 'History date' })).toBeNull()
})

test('sign-in error fallback stays outside the app and states no outcome', () => {
  navigation.pathname = '/sign-in/error'
  const { container } = render(<SignInErrorLoading />)

  expectOneStatus(container, 'Opening sign-in')
  expect(screen.getByText('Meddies')).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
  expect(container).not.toHaveTextContent(/google|sign in|account/i)
})
