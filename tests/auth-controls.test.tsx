import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render as baseRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { server } from './helpers/msw-server'
import { AuthControl } from '../src/features/auth/controls'
import { endSession } from '../src/features/auth/session-end'
import { doseSaves, type DoseSaveRequest } from '../src/features/schedules/dose-saves'
import { scheduleKeys } from '../src/features/schedules/queries'
import { endSessionQueryClient, sessionQueryClient } from '../src/lib/session-query-client'
import { sessionSaves } from '../src/lib/session-saves'

vi.mock('next-auth/react', () => ({ signOut: vi.fn(async () => ({})), signIn: vi.fn() }))
vi.mock('../src/features/auth/session-end', () => ({ endSession: vi.fn() }))

let client: QueryClient
function render(ui: ReactElement) {
  client = sessionQueryClient('owner:2099-01-01T00:00:00.000Z')
  return baseRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}
beforeEach(() => vi.mocked(endSession).mockClear())
afterEach(() => endSessionQueryClient())

const activeSession = () =>
  http.get('/api/session', () =>
    HttpResponse.json({ id: 'google:test', expires: '2099-01-01T00:00:00Z' }),
  )
const endedSession = () =>
  http.get('/api/session', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 }))
const dueAt = '2026-11-14T11:00:00.000Z' // 14:00 in Istanbul
const doseRequest: DoseSaveRequest = {
  dose: { id: 'd', scheduleId: 's', dueAt } as unknown as DoseSaveRequest['dose'],
  command: { outcome: 'Skipped' },
  correction: null,
  medicine: { label: 'Omega-3', unit: 'capsule' },
  today: () => '2026-11-14',
}
function pendingMedicineSave() {
  void sessionSaves(client).submit(
    'medicine:add',
    { payload: { label: 'Aspirin' }, label: 'Aspirin', kind: 'medicine', href: '/' },
    () => new Promise(() => {}),
  )
}

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

test('a sign-out the server refuses keeps the session and offers retry', async () => {
  const { signOut } = await import('next-auth/react')
  vi.mocked(signOut).mockClear().mockRejectedValueOnce(new Error('403'))
  server.use(activeSession())
  render(<AuthControl signedIn />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("You're still signed in")
  expect(endSession).not.toHaveBeenCalled()
  server.use(endedSession())
  await user.click(screen.getByRole('button', { name: 'Try signing out again' }))
  await waitFor(() => expect(endSession).toHaveBeenCalledWith('signed-out'))
  expect(signOut).toHaveBeenCalledTimes(2)
})

test('a lost session check stays unknown until the user retries', async () => {
  const { signOut } = await import('next-auth/react')
  vi.mocked(signOut).mockClear()
  server.use(http.get('/api/session', () => HttpResponse.error()))
  render(<AuthControl signedIn />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Couldn't check whether you're signed out",
  )
  expect(screen.queryByText(/You're still signed in|You're signed out/)).not.toBeInTheDocument()
  expect(endSession).not.toHaveBeenCalled()
  expect(signOut).toHaveBeenCalledTimes(1)
  server.use(endedSession())
  await user.click(screen.getByRole('button', { name: 'Try signing out again' }))
  await waitFor(() => expect(endSession).toHaveBeenCalledWith('signed-out'))
  expect(signOut).toHaveBeenCalledTimes(2)
})

test('offline sends nothing, and reconnect waits for the user to sign out', async () => {
  const { signOut } = await import('next-auth/react')
  vi.mocked(signOut).mockClear()
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  server.use(endedSession())
  render(<AuthControl signedIn />)
  expect(screen.getByRole('button', { name: 'Connect to sign out' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent("You're offline")
  online.mockReturnValue(true)
  fireEvent.online(window)
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
  expect(signOut).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await waitFor(() => expect(endSession).toHaveBeenCalledWith('signed-out'))
  expect(signOut).toHaveBeenCalledTimes(1)
  online.mockRestore()
})

test('no pending or unconfirmed save keeps sign-out one tap', async () => {
  const { signOut } = await import('next-auth/react')
  vi.mocked(signOut).mockClear()
  server.use(activeSession())
  render(<AuthControl signedIn />)
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(signOut).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: 'Stay signed in' })).not.toBeInTheDocument()
})

test('a pending setup save warns by name; staying signed in keeps it and signs nothing out', async () => {
  const { signOut } = await import('next-auth/react')
  vi.mocked(signOut).mockClear()
  render(<AuthControl signedIn />)
  act(pendingMedicineSave)
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(signOut).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent(
    "A medication save hasn't finished yet.If you sign out now, Meddies can't show whether Aspirin was recorded until you sign in again.",
  )
  expect(screen.getByRole('alert')).not.toHaveTextContent(/confirmed|cancel/i)
  expect(screen.getByRole('button', { name: 'Stay signed in' })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Stay signed in' }))
  expect(signOut).not.toHaveBeenCalled()
  expect(sessionSaves(client).entries.get('medicine:add')?.status).toBe('pending')
  expect(screen.getByRole('button', { name: 'Sign out' })).toHaveFocus()
})

test('Sign out anyway uses server confirmation and an active session stays signed in', async () => {
  const { signOut } = await import('next-auth/react')
  vi.mocked(signOut).mockClear()
  server.use(activeSession())
  render(<AuthControl signedIn />)
  act(pendingMedicineSave)
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await userEvent.click(screen.getByRole('button', { name: 'Sign out anyway' }))
  expect(signOut).toHaveBeenCalledTimes(1)
  expect(await screen.findByRole('alert')).toHaveTextContent("You're still signed in")
  expect(sessionSaves(client).entries.get('medicine:add')?.status).toBe('pending')
})

test('an unconfirmed dose save names its dose, and reconciling it removes the warning', async () => {
  server.use(
    http.get('/api/session', () =>
      HttpResponse.json({ id: 'google:test', expires: '2099-01-01T00:00:00Z' }),
    ),
    http.get('/api/schedules', () => HttpResponse.error()),
    http.put('/api/schedules', () => HttpResponse.error()),
  )
  render(<AuthControl signedIn />)
  const doses = doseSaves(client)
  await act(() => doses.submit('s|due', doseRequest))
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(screen.getByRole('alert')).toHaveTextContent(
    "A dose save hasn't finished yet.If you sign out now, Meddies can't show whether Omega-3 14:00 was recorded",
  )
  act(() => doses.reviewCurrent('s|due'))
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Stay signed in' })).not.toBeInTheDocument(),
  )
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
})

test('Stay signed in leaves an unconfirmed dose save reconciling', async () => {
  server.use(
    http.get('/api/schedules', () => HttpResponse.error()),
    http.put('/api/schedules', () => HttpResponse.error()),
  )
  render(<AuthControl signedIn />)
  const doses = doseSaves(client)
  await act(() => doses.submit('s|due', doseRequest))
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await userEvent.click(screen.getByRole('button', { name: 'Stay signed in' }))
  expect(doses.get('s|due')).toBeDefined()
  const record = { scheduleId: 's', dueAt, outcome: 'Skipped', revision: 0 }
  await act(async () => {
    client.setQueryData(scheduleKeys.snapshot(), {
      schedules: [],
      records: [record],
      now: dueAt,
      date: '2026-11-14',
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  await waitFor(() => expect(doses.get('s|due')).toBeUndefined())
})

test('several outstanding saves are all named', async () => {
  render(<AuthControl signedIn />)
  act(() => {
    pendingMedicineSave()
    void sessionSaves(client).submit(
      'schedule:x',
      { payload: {}, label: 'Vitamin D', kind: 'schedule', href: '/' },
      () => new Promise(() => {}),
    )
  })
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(screen.getByRole('alert')).toHaveTextContent(
    "Some saves haven't finished yet.If you sign out now, Meddies can't show whether Aspirin and the schedule for Vitamin D were recorded",
  )
})
