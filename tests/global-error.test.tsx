import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import GlobalError from '@/app/global-error'

// next/font is transformed by Next's compiler, which isn't present in component tests.
vi.mock('next/font/local', () => ({ default: () => ({ variable: 'nunito' }) }))

test('root failure renders its own document and recovery without layout providers', async () => {
  const retry = vi.fn()
  render(<GlobalError retry={retry} />, { container: document })
  expect(document.documentElement).toHaveAttribute('lang', 'en')
  expect(screen.getByRole('heading', { name: 'Meddies' })).toBeVisible()
  expect(screen.getByRole('alert')).toHaveTextContent("This page couldn't open.")
  expect(screen.getByRole('alert')).toHaveTextContent("Your records haven't changed.")
  expect(screen.getByRole('link', { name: 'Open Today' })).toHaveAttribute('href', '/')
  await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
  expect(retry).toHaveBeenCalledOnce()
})
