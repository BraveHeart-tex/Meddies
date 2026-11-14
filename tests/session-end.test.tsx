import { signIn } from 'next-auth/react'
import { useQueryClient } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AuthControl } from '../src/features/auth/controls'
import { SessionBoundary } from '../src/features/auth/session-boundary'
import { activeSessionQueryClient, endSessionQueryClient } from '../src/lib/session-query-client'
import { confirmSessionEnd, PrivateReadError } from '../src/lib/session-check'
import { requestSave, sessionSaves } from '../src/lib/session-saves'
import { readSessionDraft, writeSessionDraft } from '../src/lib/session-drafts'
import { toast, Toaster } from '../src/components/ui/toast'
import { doseSaves, type DoseSaveRequest } from '../src/features/schedules/dose-saves'
import { useSessionFormDraft } from '../src/lib/use-session-form-draft'
import { useForm } from 'react-hook-form'
import { useEffect } from 'react'
import { server } from './helpers/msw-server'

vi.mock('next-auth/react', () => ({ signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}))

const later = () => new Date(Date.now() + 3_600_000).toISOString()
const replace = vi.fn()
const realLocation = window.location

function at(path: string) {
  const url = new URL(path, realLocation.origin)
  vi.stubGlobal('location', {
    href: url.href,
    origin: url.origin,
    pathname: url.pathname,
    search: url.search,
    replace,
  })
}

let checks = 0
function sessionAnswers(answer: () => Response | Promise<Response>) {
  server.use(
    http.get('/api/session', () => {
      checks++
      return answer()
    }),
  )
}
const signedOut = () => new HttpResponse(null, { status: 401 })
const active = () => HttpResponse.json({ id: 'google:owner', expires: later() })

function Private() {
  return <p>Private Omega-3</p>
}

function mount(expires = later()) {
  return render(
    <SessionBoundary ownerId="google:owner" expires={expires}>
      <Private />
    </SessionBoundary>,
  )
}

const clientOf = () => activeSessionQueryClient()!

beforeEach(() => {
  checks = 0
  replace.mockClear()
  at('/history?date=2026-11-04')
})
afterEach(() => {
  endSessionQueryClient()
  vi.unstubAllGlobals()
})

const signInShown = () =>
  expect(screen.getByRole('heading', { name: 'Good to see you' })).toBeVisible()

test('the absolute deadline ends the session without a network request', async () => {
  sessionAnswers(active)
  mount(new Date(Date.now() - 1000).toISOString())
  await screen.findByRole('heading', { name: 'Good to see you' })
  expect(screen.queryByText('Private Omega-3')).not.toBeInTheDocument()
  expect(checks).toBe(0)
  expect(replace).toHaveBeenCalledWith(
    `/?reason=expired&returnTo=${encodeURIComponent('/history?date=2026-11-04')}`,
  )
})

test('offline expiry keeps the sign-in screen instead of navigating to nothing', async () => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const replaceState = vi.spyOn(window.history, 'replaceState')
  mount(new Date(Date.now() - 1000).toISOString())
  await screen.findByRole('heading', { name: 'Good to see you' })
  expect(replace).not.toHaveBeenCalled()
  expect(replaceState).toHaveBeenCalled()
  online.mockRestore()
  replaceState.mockRestore()
})

test.each([
  ['an active session', active],
  ['an unavailable check', () => new HttpResponse(null, { status: 503 })],
  ['a network failure', () => HttpResponse.error()],
])('%s after a read 401 does not end the session', async (_name, answer) => {
  sessionAnswers(answer)
  mount()
  await act(() =>
    clientOf()
      .fetchQuery({
        queryKey: ['private'],
        queryFn: () => Promise.reject(new PrivateReadError(401)),
      })
      .catch(() => {}),
  )
  await waitFor(() => expect(checks).toBe(1))
  await act(() => confirmSessionEnd())
  expect(screen.getByText('Private Omega-3')).toBeVisible()
  expect(replace).not.toHaveBeenCalled()
})

test('a read 401 confirmed by the session check ends the session once', async () => {
  sessionAnswers(signedOut)
  mount()
  await act(async () => {
    await Promise.all([
      clientOf()
        .fetchQuery({
          queryKey: ['a'],
          queryFn: () => Promise.reject(new PrivateReadError(401)),
        })
        .catch(() => {}),
      clientOf()
        .fetchQuery({
          queryKey: ['b'],
          queryFn: () => Promise.reject(new PrivateReadError(401)),
        })
        .catch(() => {}),
    ])
  })
  await screen.findByRole('heading', { name: 'Good to see you' })
  expect(replace).toHaveBeenCalledTimes(1)
  expect(checks).toBe(1)
})

test('focus uses the same check; a confirmed 401 ends the session', async () => {
  sessionAnswers(active)
  mount()
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
    await confirmSessionEnd()
  })
  expect(screen.getByText('Private Omega-3')).toBeVisible()
  sessionAnswers(signedOut)
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
  await screen.findByRole('heading', { name: 'Good to see you' })
  expect(replace).toHaveBeenCalledTimes(1)
})

test('a save 401 holds the save pending, then ends with only a generic notice', async () => {
  let answer!: () => void
  const held = new Promise<void>((resolve) => (answer = resolve))
  sessionAnswers(async () => {
    await held
    return signedOut()
  })
  server.use(http.post('/api/medicines', () => new HttpResponse(null, { status: 401 })))
  mount()
  const store = sessionSaves(clientOf())
  const saved = store.submit(
    'medicine:add',
    {
      payload: { label: 'Omega-3' },
      label: 'Omega-3',
      kind: 'medicine',
      href: '/medications?add',
    },
    (payload) => requestSave('/api/medicines', payload, (data) => data),
  )
  await waitFor(() => expect(checks).toBe(1))
  expect(store.entries.get('medicine:add')?.status).toBe('pending')
  act(() => answer())
  await act(() => saved)
  await screen.findByRole('heading', { name: 'Good to see you' })
  const href = replace.mock.calls[0][0] as string
  expect(href).toBe(
    `/?reason=expired&returnTo=${encodeURIComponent('/history?date=2026-11-04')}&notice=save-in-progress`,
  )
  expect(href).not.toMatch(/Omega/)
  expect(store.entries.size).toBe(0)
  expect(screen.getByRole('status')).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'A save was still in progress. After signing in, check whether it was recorded.',
    ),
  )
})

test('a save 401 with an active session stays a retryable unconfirmed save', async () => {
  sessionAnswers(active)
  server.use(http.post('/api/medicines', () => new HttpResponse(null, { status: 401 })))
  mount()
  const store = sessionSaves(clientOf())
  await act(() =>
    store.submit(
      'medicine:add',
      { payload: { label: 'Omega-3' }, label: 'Omega-3', kind: 'medicine', href: '/' },
      (payload) => requestSave('/api/medicines', payload, (data) => data),
    ),
  )
  expect(store.entries.get('medicine:add')?.result?.problem).toBe('unconfirmed')
  expect(replace).not.toHaveBeenCalled()
})

test('session end removes drafts and private Toasts, and a late save cannot report back', async () => {
  sessionAnswers(signedOut)
  render(<Toaster />)
  let respond!: (value: Response) => void
  const late = new Promise<Response>((resolve) => (respond = resolve))
  server.use(http.post('/api/medicines', () => late))
  mount()
  const client = clientOf()
  writeSessionDraft(client, 'medicine:add', { label: 'Omega-3' })
  act(() => void toast.add({ title: 'Omega-3 09:00 might not have saved' }))
  await screen.findByText('Omega-3 09:00 might not have saved')
  const store = sessionSaves(client)
  const saved = store.submit(
    'medicine:add',
    { payload: { label: 'Omega-3' }, label: 'Omega-3', kind: 'medicine', href: '/' },
    (payload) => requestSave('/api/medicines', payload, (data) => data),
  )
  await act(() => confirmSessionEnd())
  await waitFor(() =>
    expect(screen.queryByText('Omega-3 09:00 might not have saved')).not.toBeInTheDocument(),
  )
  expect(readSessionDraft(client, 'medicine:add')).toBeUndefined()
  respond(HttpResponse.json({ medicines: [] }))
  await act(() => saved)
  expect(store.entries.size).toBe(0)
})

test.each([
  ['/medications?add', '/medications?add'],
  [
    '/medications?medicine=00000000-0000-4000-8000-000000000001',
    '/medications?medicine=00000000-0000-4000-8000-000000000001',
  ],
  ['/history?date=2026-11-04', '/history?date=2026-11-04'],
  ['/settings', '/settings'],
  ['/medications?medicine=../../evil', '/'],
  ['/history?date=not-a-date', '/'],
  ['/not-a-page', '/'],
])('session end at %s returns to %s', async (location, destination) => {
  at(location)
  sessionAnswers(signedOut)
  mount()
  await act(() => confirmSessionEnd())
  signInShown()
  expect(replace).toHaveBeenCalledWith(
    `/?reason=expired&returnTo=${encodeURIComponent(destination)}`,
  )
})

test('private content is not reachable through a child still holding the client', async () => {
  sessionAnswers(signedOut)
  const held: { client?: ReturnType<typeof useQueryClient> } = {}
  function Child() {
    const client = useQueryClient()
    useEffect(() => {
      held.client = client
    }, [client])
    return null
  }
  render(
    <SessionBoundary ownerId="google:owner" expires={later()}>
      <Child />
    </SessionBoundary>,
  )
  await act(() => confirmSessionEnd())
  held.client!.setQueryData(['private'], ['Omega-3'])
  expect(held.client!.getQueryData(['private'])).toBeUndefined()
})

const doseRequest: DoseSaveRequest = {
  dose: {
    id: 'd',
    scheduleId: 's',
    dueAt: '2026-11-14T11:00:00.000Z',
  } as unknown as DoseSaveRequest['dose'],
  command: { outcome: 'Skipped' },
  correction: null,
  medicine: { label: 'Omega-3', unit: 'capsule' },
  today: () => '2026-11-14',
}

test('a confirmed dose save 401 ends the session with the generic notice', async () => {
  sessionAnswers(signedOut)
  server.use(
    http.get('/api/schedules', () => HttpResponse.error()),
    http.put('/api/schedules', () => new HttpResponse(null, { status: 401 })),
  )
  mount()
  const doses = doseSaves(clientOf())
  await act(() => doses.submit('s|due', doseRequest))
  await screen.findByRole('heading', { name: 'Good to see you' })
  expect(replace.mock.calls[0][0]).toMatch(/&notice=save-in-progress$/)
  expect(doses.outstanding()).toEqual([])
})

test('a dose save 401 with an active session continues as an unconfirmed save', async () => {
  sessionAnswers(active)
  server.use(
    http.get('/api/schedules', () => HttpResponse.error()),
    http.put('/api/schedules', () => new HttpResponse(null, { status: 401 })),
  )
  mount()
  const doses = doseSaves(clientOf())
  await act(() => doses.submit('s|due', doseRequest))
  expect(doses.get('s|due')?.problem).toEqual({ kind: 'uncertain', checked: false })
  expect(replace).not.toHaveBeenCalled()
})

test('a dose response whose body arrives after session end reports nothing', async () => {
  sessionAnswers(signedOut)
  let finishBody!: () => void
  const body = new ReadableStream({
    start(controller) {
      finishBody = () => {
        controller.enqueue(new TextEncoder().encode('{"record":null}'))
        controller.close()
      }
    },
  })
  server.use(
    http.put(
      '/api/schedules',
      () => new HttpResponse(body, { headers: { 'Content-Type': 'application/json' } }),
    ),
  )
  mount()
  const doses = doseSaves(clientOf())
  const onRecorded = vi.fn()
  const saved = doses.submit('s|due', { ...doseRequest, onRecorded })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    await confirmSessionEnd()
  })
  finishBody()
  await act(() => saved)
  expect(onRecorded).not.toHaveBeenCalled()
  expect(doses.outstanding()).toEqual([])
})

test('a form still mounted at session end cannot write its draft back', async () => {
  sessionAnswers(signedOut)
  const held: { form?: ReturnType<typeof useForm<{ label: string }>> } = {}
  function Draft() {
    const form = useForm({ defaultValues: { label: '' } })
    useSessionFormDraft('medicine:add', form)
    useEffect(() => {
      held.form = form
    }, [form])
    return null
  }
  render(
    <SessionBoundary ownerId="google:owner" expires={later()}>
      <Draft />
    </SessionBoundary>,
  )
  const client = clientOf()
  const retained = held.form!
  act(() => retained.setValue('label', 'Omega-3'))
  expect(readSessionDraft(client, 'medicine:add')).toEqual({ label: 'Omega-3' })
  await act(() => confirmSessionEnd())
  retained.setValue('label', 'Omega-3 again')
  expect(readSessionDraft(client, 'medicine:add')).toBeUndefined()
})

test.each(['/settings', '/history?date=2026-11-04'])(
  'sign-out from %s starts the next session on Today',
  async (location) => {
    at(location)
    sessionAnswers(signedOut)
    vi.mocked(signIn).mockClear()
    render(
      <SessionBoundary ownerId="google:owner" expires={later()}>
        <AuthControl signedIn />
      </SessionBoundary>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('heading', { name: 'Good to see you' })
    expect(replace).toHaveBeenCalledWith('/?reason=signed-out&returnTo=%2F')
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(signIn).toHaveBeenCalledWith('google', { redirect: false, redirectTo: '/' })
  },
)

test('Sign out anyway ends the session only after the server confirms, keeping the notice', async () => {
  let answer!: () => void
  const held = new Promise<void>((resolve) => (answer = resolve))
  sessionAnswers(async () => {
    await held
    return signedOut()
  })
  at('/settings')
  render(
    <SessionBoundary ownerId="google:owner" expires={later()}>
      <AuthControl signedIn />
    </SessionBoundary>,
  )
  act(() => {
    void sessionSaves(clientOf()).submit(
      'medicine:add',
      { payload: {}, label: 'Omega-3', kind: 'medicine', href: '/' },
      () => new Promise(() => {}),
    )
  })
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await userEvent.click(screen.getByRole('button', { name: 'Sign out anyway' }))
  await waitFor(() => expect(checks).toBe(1))
  expect(replace).not.toHaveBeenCalled()
  act(() => answer())
  await screen.findByRole('heading', { name: 'Good to see you' })
  expect(replace).toHaveBeenCalledWith('/?reason=signed-out&returnTo=%2F&notice=save-in-progress')
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'A save was still in progress. After signing in, check whether it was recorded.',
    ),
  )
})
