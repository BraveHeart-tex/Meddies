import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { SignInScreen } from '../src/features/auth/sign-in-screen'

vi.mock('next-auth/react', () => ({ signIn: vi.fn() }))

test('default sign-in has no Alert; opening Google is disabled and busy', async () => {
  const { signIn } = await import('next-auth/react')
  vi.mocked(signIn).mockReturnValue(new Promise(() => {}))
  render(<SignInScreen configured returnTo="/history?date=2026-10-30" />)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
  expect(screen.getByRole('button', { name: 'Opening Google…' })).toBeDisabled()
  expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  expect(signIn).toHaveBeenLastCalledWith('google', {
    redirect: false,
    redirectTo: '/history?date=2026-10-30',
  })
})

test.each([
  [
    { error: 'AccessDenied' },
    "This Google account can't open Meddies.",
    'Choose another Google account',
  ],
  [{ error: 'Callback' }, "Sign-in with Google didn't finish.", 'Try again'],
  [{ reason: 'expired' }, 'Your session ended.', 'Continue with Google'],
  [
    { reason: 'signed-out' },
    "You're signed out of Meddies in this browser.",
    'Continue with Google',
  ],
  [
    { configured: false, error: 'AccessDenied', reason: 'expired' },
    'Sign-in is unavailable right now.',
    'Reload',
  ],
] as [{ error?: string; reason?: string; configured?: boolean }, string, string][])(
  'one applicable message and action: %s',
  async (props, message, action) => {
    render(<SignInScreen configured {...props} />)
    await screen.findByText(message)
    expect(
      screen.getByRole(
        props.reason && props.configured !== false && !props.error ? 'status' : 'alert',
      ),
    ).toHaveTextContent(message)
    expect([...screen.queryAllByRole('alert'), ...screen.queryAllByRole('status')]).toHaveLength(1)
    expect(screen.getByRole('button', { name: action })).toBeEnabled()
    if (props.configured === false)
      expect(screen.queryByRole('button', { name: /Google/ })).not.toBeInTheDocument()
    if (props.reason || props.error) expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  },
)

test.each([
  ['expired', 'Your session ended.'],
  ['signed-out', "You're signed out"],
])(
  'reason %s focuses the heading, announces once politely, then tabs to Google',
  async (reason, message) => {
    render(<SignInScreen configured reason={reason} />)
    const status = await screen.findByRole('status')
    expect(status).toHaveAttribute('aria-atomic', 'true')
    expect(status).toHaveTextContent(message)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const heading = screen.getByRole('heading', { name: 'Good to see you', level: 1 })
    expect(heading).toHaveFocus()
    expect(heading).not.toHaveAttribute('aria-describedby')
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toHaveFocus()
  },
)

test('pre-redirect failure replaces the reason with one retry; retry keeps the destination', async () => {
  const { signIn } = await import('next-auth/react')
  vi.mocked(signIn).mockRejectedValue(new TypeError('Network'))
  render(<SignInScreen configured reason="expired" returnTo="/medications?add" />)
  await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
  expect(screen.getByRole('alert')).toHaveTextContent("Couldn't reach Google.")
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(signIn).toHaveBeenLastCalledWith('google', {
    redirect: false,
    redirectTo: '/medications?add',
  })
})

test('known offline offers retry without dispatching; returning online permits retry', async () => {
  const { signIn } = await import('next-auth/react')
  vi.mocked(signIn).mockClear().mockRejectedValue(new TypeError('Network'))
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  render(<SignInScreen configured />)
  await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
  expect(signIn).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('Check your connection and try again.')
  online.mockReturnValue(true)
  fireEvent.online(window)
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(signIn).toHaveBeenCalledOnce()
  online.mockRestore()
})

const saveNotice = 'A save was still in progress. After signing in, check whether it was recorded.'

test.each(['expired', 'signed-out'])('reason %s adds the generic save notice', (reason) => {
  render(<SignInScreen configured reason={reason} saveInProgress />)
  expect(screen.getByText(new RegExp(saveNotice))).toBeVisible()
})

test('the save notice needs a session-end reason and never claims cancellation', () => {
  render(<SignInScreen configured saveInProgress />)
  expect(screen.queryByText(new RegExp(saveNotice))).not.toBeInTheDocument()
  expect(saveNotice).not.toMatch(/cancel|not saved/i)
})
