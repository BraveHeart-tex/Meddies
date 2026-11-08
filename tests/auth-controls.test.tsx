import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { server } from './helpers/msw-server'
import { AuthControl } from '../src/features/auth/controls'

vi.mock('next-auth/react', () => ({ signOut: vi.fn(async () => ({})), signIn: vi.fn() }))

test('sign-out announces pending, then distinguishes an active session from an unknown result', async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get('/api/session', async () => {
      await held
      return HttpResponse.json({ id: 'google:test', expires: '2099-01-01T00:00:00Z' })
    }),
  )
  render(<AuthControl signedIn />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Signing out…')
  release()
  expect(await screen.findByRole('alert')).toHaveTextContent("You're still signed in")
  server.use(http.get('/api/session', () => HttpResponse.json({ unexpected: true })))
  await user.click(screen.getByRole('button', { name: 'Try signing out again' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Couldn't check whether you're signed out",
  )
  expect(screen.queryByText(/You're still signed in/)).not.toBeInTheDocument()
})

test('known offline prevents sign-out and reconnect restores the action without submitting', async () => {
  const { signOut } = await import('next-auth/react')
  vi.mocked(signOut).mockClear()
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  render(<AuthControl signedIn />)
  expect(screen.getByRole('button', { name: 'Connect to sign out' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent("You're offline")
  online.mockReturnValue(true)
  fireEvent.online(window)
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
  expect(signOut).not.toHaveBeenCalled()
  online.mockRestore()
})
