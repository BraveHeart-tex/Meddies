import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MedicineForm } from '../src/features/medicines/medicine-form'
import type { Medicine } from '../src/features/medicines/contract'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
})
afterEach(() => {
  client.clear()
  vi.restoreAllMocks()
})

function openAdd(onSaved = vi.fn()) {
  const view = render(
    <QueryClientProvider client={client}>
      <MedicineForm onSaved={onSaved} />
    </QueryClientProvider>,
  )
  return { ...view, user: userEvent.setup(), onSaved }
}
const name = () => screen.getByRole('textbox', { name: 'Medication name' })
const strength = () => screen.getByRole('textbox', { name: /^Strength/ })
const button = (label: string) => screen.getByRole('button', { name: label })
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(name(), 'Test Medicine')
  await user.type(strength(), ' 5 mg ')
  await user.click(button('Capsule'))
}

test('submit-first validation focuses the first invalid field and clears corrected errors', async () => {
  let posts = 0
  server.use(
    http.post('/api/medicines', () => {
      posts++
      return HttpResponse.error()
    }),
  )
  const { user } = openAdd()
  expect(button('Tablet')).toHaveAttribute('aria-pressed', 'false')
  expect(button('Capsule')).toHaveAttribute('aria-pressed', 'false')
  const unit = screen.getByRole('group', { name: 'Unit' })
  expect(unit).toHaveAccessibleDescription(/whole or half tablets/)
  await user.type(strength(), 'x'.repeat(121))
  expect(screen.queryByText('Use 120 characters or fewer.')).not.toBeInTheDocument()
  await user.click(button('Save medication'))
  await waitFor(() => expect(name()).toHaveFocus())
  expect(name()).toHaveAttribute('aria-invalid', 'true')
  expect(name()).toHaveAccessibleDescription(/Enter the medication name\./)
  expect(strength()).toHaveAccessibleDescription(/Use 120 characters or fewer\./)
  expect(unit).toHaveAccessibleDescription(/Choose tablet or capsule\./)
  await user.type(name(), `Medicine ${'L'.repeat(60)}`)
  await waitFor(() => expect(name()).toHaveAttribute('aria-invalid', 'false'))
  await user.clear(strength())
  await user.type(strength(), ' 5 mg ')
  expect(screen.queryByText('Use 120 characters or fewer.')).not.toBeInTheDocument()
  await user.click(button('Save medication'))
  await waitFor(() => expect(button('Tablet')).toHaveFocus())
  await user.click(button('Capsule'))
  expect(button('Capsule')).toHaveAttribute('aria-pressed', 'true')
  await waitFor(() =>
    expect(screen.queryByText('Choose tablet or capsule.')).not.toBeInTheDocument(),
  )
  expect(posts).toBe(0)
})

test('a rejected save keeps raw values and allows a fresh save', async () => {
  server.use(
    http.post('/api/medicines', () => HttpResponse.json({ error: 'validation' }, { status: 400 })),
  )
  const { user, onSaved } = openAdd()
  await fill(user)
  await user.click(button('Save medication'))
  expect(await screen.findByRole('alert')).toHaveTextContent("Test Medicine wasn't saved.")
  expect(name()).toHaveValue('Test Medicine')
  expect(strength()).toHaveValue(' 5 mg ')
  expect(button('Capsule')).toHaveAttribute('aria-pressed', 'true')
  expect(button('Save medication')).toBeEnabled()
  expect(onSaved).not.toHaveBeenCalled()
})

test('an unconfirmed save retries the identical request once and locks while pending', async () => {
  const posted: Medicine[] = []
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines: [] })),
    http.post('/api/medicines', async ({ request }) => {
      const payload = (await request.json()) as Medicine
      posted.push(payload)
      if (posted.length === 1) return HttpResponse.error()
      await held
      return HttpResponse.json({ medicines: [payload] })
    }),
  )
  const { user, onSaved } = openAdd()
  await fill(user)
  await user.click(button('Save medication'))
  expect(await screen.findByRole('alert')).toHaveTextContent('That might not have saved.')
  expect(name()).toHaveValue('Test Medicine')
  expect(strength()).toHaveValue(' 5 mg ')
  expect(button('Capsule')).toHaveAttribute('aria-pressed', 'true')
  const retry = button('Try saving medication again')
  expect(retry).toHaveAccessibleDescription(/Trying again saves Test Medicine only once/)
  // Two submissions in one turn exercise the synchronous guard before a pending render.
  act(() => {
    fireEvent.submit(retry.closest('form')!)
    fireEvent.submit(retry.closest('form')!)
  })
  await waitFor(() => expect(posted).toHaveLength(2))
  expect(button('Saving medication...')).toBeDisabled()
  expect(name()).toBeDisabled()
  expect(strength()).toBeDisabled()
  expect(button('Capsule')).toBeDisabled()
  expect(onSaved).not.toHaveBeenCalled()
  expect(posted[1]).toEqual(posted[0])
  expect(posted[1]).toMatchObject({
    label: 'Test Medicine',
    strength: '5 mg',
    unit: 'capsule',
    id: expect.any(String),
  })
  release()
  await waitFor(() => expect(onSaved).toHaveBeenCalledExactlyOnceWith(posted[0]))
  expect(posted).toHaveLength(2)
})

test('a lost response reconciles before claiming failure', async () => {
  let saved: Medicine | undefined
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let reads = 0
  let posts = 0
  server.use(
    http.post('/api/medicines', async ({ request }) => {
      posts++
      saved = (await request.json()) as Medicine
      return HttpResponse.error()
    }),
    http.get('/api/medicines', async () => {
      reads++
      await held
      return HttpResponse.json({ medicines: [saved] })
    }),
  )
  const { user, onSaved } = openAdd()
  await fill(user)
  await user.click(button('Save medication'))
  await waitFor(() => expect(reads).toBe(1))
  expect(button('Saving medication...')).toBeDisabled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(onSaved).not.toHaveBeenCalled()
  release()
  await waitFor(() => expect(onSaved).toHaveBeenCalledExactlyOnceWith(saved))
  expect(screen.queryByText('That might not have saved.')).not.toBeInTheDocument()
  expect(posts).toBe(1)
  expect(reads).toBe(1)
})

test('a conflict locks the form and offers Medications', async () => {
  server.use(
    http.post('/api/medicines', () => HttpResponse.json({ error: 'conflict' }, { status: 409 })),
  )
  const { user, onSaved } = openAdd()
  await fill(user)
  await user.click(button('Save medication'))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'A different version of this medication is already saved.',
  )
  expect(name()).toBeDisabled()
  expect(strength()).toBeDisabled()
  expect(button('Tablet')).toBeDisabled()
  expect(button('Capsule')).toBeDisabled()
  expect(screen.queryByRole('button', { name: /save medication/i })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open Medications' })).toHaveAttribute(
    'href',
    '/medications',
  )
  expect(onSaved).not.toHaveBeenCalled()
})

test('known offline waits for a connection, keeps values and queues nothing', async () => {
  let posts = 0
  server.use(
    http.post('/api/medicines', () => {
      posts++
      return HttpResponse.error()
    }),
  )
  const { user } = openAdd()
  await fill(user)
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  fireEvent(window, new Event('offline'))
  expect(button('Connect to save')).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent("You're offline.")
  await user.clear(strength())
  await user.type(strength(), '10 mg')
  await user.click(button('Connect to save'))
  expect(posts).toBe(0)
  online.mockReturnValue(true)
  fireEvent(window, new Event('online'))
  expect(button('Save medication')).toBeEnabled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(name()).toHaveValue('Test Medicine')
  expect(strength()).toHaveValue('10 mg')
  expect(button('Capsule')).toHaveAttribute('aria-pressed', 'true')
  expect(posts).toBe(0)
})

test('the session draft survives leaving Add and clears explicitly and after confirmation', async () => {
  server.use(
    http.post('/api/medicines', async ({ request }) =>
      HttpResponse.json({ medicines: [await request.json()] }),
    ),
  )
  const note = 'Pick up where you left off. Your details are still here.'
  let view = openAdd()
  expect(screen.queryByText(note)).not.toBeInTheDocument()
  await fill(view.user)
  view.unmount()
  view = openAdd()
  expect(name()).toHaveValue('Test Medicine')
  expect(strength()).toHaveValue(' 5 mg ')
  expect(button('Capsule')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText(note)).toBeVisible()
  await view.user.click(button('Clear form'))
  expect(name()).toHaveValue('')
  expect(strength()).toHaveValue('')
  expect(button('Capsule')).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByText(note)).not.toBeInTheDocument()
  view.unmount()
  view = openAdd()
  expect(name()).toHaveValue('')
  expect(screen.queryByText(note)).not.toBeInTheDocument()
  await fill(view.user)
  view.unmount()
  view = openAdd()
  expect(screen.getByText(note)).toBeVisible()
  await view.user.click(button('Save medication'))
  await waitFor(() => expect(view.onSaved).toHaveBeenCalledOnce())
  expect(name()).toHaveValue('')
  expect(strength()).toHaveValue('')
  expect(button('Capsule')).toHaveAttribute('aria-pressed', 'false')
  view.unmount()
  openAdd()
  expect(name()).toHaveValue('')
  expect(strength()).toHaveValue('')
  expect(button('Tablet')).toHaveAttribute('aria-pressed', 'false')
  expect(button('Capsule')).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByText(note)).not.toBeInTheDocument()
})
