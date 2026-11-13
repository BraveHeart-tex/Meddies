import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import ErrorPage from '@/app/error'

vi.mock('next/navigation', () => ({ usePathname: () => '/unknown-address' }))

test('unexpected errors keep navigation and offer retry and Today without sign-in advice', async () => {
  const retry = vi.fn()
  render(<ErrorPage retry={retry} />)
  expect(screen.getByRole('alert')).toHaveTextContent("This page couldn't open.")
  expect(screen.getByRole('alert')).toHaveTextContent("Your records haven't changed.")
  expect(screen.getByRole('heading', { name: 'Meddies' })).toBeVisible()
  expect(
    within(screen.getByRole('navigation', { name: 'Primary' })).getAllByRole('link'),
  ).toHaveLength(4)
  expect(screen.getAllByRole('link', { name: 'Settings' })).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Open Today' })).toHaveAttribute('href', '/')
  expect(screen.queryByText(/sign.in/i)).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
  expect(retry).toHaveBeenCalledOnce()
})

test('unknown addresses show public recovery content with no navigation tab selected', async () => {
  const { default: NotFound } = await import('@/app/not-found')
  render(<NotFound />)
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  expect(screen.getByRole('alert')).toHaveTextContent("This page isn't in Meddies.")
  expect(screen.getByRole('alert')).toHaveTextContent(
    "The link may be old or mistyped. Your records haven't changed.",
  )
  for (const link of within(screen.getByRole('navigation', { name: 'Primary' })).getAllByRole(
    'link',
  )) {
    expect(link).not.toHaveAttribute('aria-current')
  }
  expect(screen.getAllByRole('link', { name: 'Settings' })).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Open Today' })).toHaveAttribute('href', '/')
})
