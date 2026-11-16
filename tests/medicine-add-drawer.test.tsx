import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import { MedicineAddDrawer } from '../src/features/medicines/medicine-add-drawer'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import type { NextRouter } from 'next/router'
import { MedicationsReady, MedicationsSection } from '../src/features/medicines/medications-section'
import { MedicationsHeader } from '../src/features/medicines/medications-header'
import { medicineKeys } from '../src/features/medicines/queries'
import { scheduleKeys } from '../src/features/schedules/queries'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/medications',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

const note = 'Unsaved details restored.'
let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
  window.history.replaceState(null, '', '/medications?add')
})
afterEach(() => {
  client.clear()
  window.history.replaceState(null, '', '/')
})

function openDrawer(onSaved = vi.fn()) {
  const ui = (open: boolean) => (
    <QueryClientProvider client={client}>
      <MedicineAddDrawer open={open} returnFocus={!open} onSaved={onSaved} />
    </QueryClientProvider>
  )
  const view = render(ui(true))
  return {
    ...view,
    onSaved,
    user: userEvent.setup(),
    setOpen: (open: boolean) => view.rerender(ui(open)),
  }
}
const name = () => screen.getByRole('textbox', { name: 'Name' })
const close = () => screen.getByRole('button', { name: 'Close' })
const backdrop = () => document.querySelector<HTMLElement>('[data-slot="drawer-overlay"]')!

const dismissals = [
  ['Close', (user: ReturnType<typeof userEvent.setup>) => user.click(close())],
  ['Escape', (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
  ['backdrop', (user: ReturnType<typeof userEvent.setup>) => user.click(backdrop())],
] as const

test('shows the inset rows, help text and one primary action under a centered title', async () => {
  openDrawer()
  const dialog = screen.getByRole('dialog', { name: 'Add medication' })
  expect(dialog).toContainElement(close())
  expect(name()).toHaveAttribute('placeholder', 'On your pack')
  expect(screen.getByRole('textbox', { name: 'Strength' })).toHaveAttribute(
    'placeholder',
    'Optional',
  )
  expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Choose')
  expect(screen.getByText('On the pack, e.g. 200 mg. Not your dose amount.')).toBeVisible()
  expect(
    screen.queryByText('Schedules use whole or half tablets, or whole capsules.'),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Type' })).not.toHaveAccessibleDescription()
  expect(screen.getByRole('button', { name: 'Save medication' })).toBeEnabled()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Add medication' })).toHaveFocus())
})

test('Add keeps the Medications header behind the Drawer, with no Back row or Add page header', () => {
  render(
    <QueryClientProvider client={client}>
      <MedicationsHeader />
    </QueryClientProvider>,
  )
  expect(screen.getByRole('heading', { level: 1, name: 'Medications' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Add medication' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Medications' })).not.toBeInTheDocument()
})

test.each(dismissals)(
  '%s discards the session draft and returns to the list',
  async (_, dismiss) => {
    const { user, setOpen } = openDrawer()
    await user.type(name(), 'Magnesium')
    await dismiss(user)
    await waitFor(() => expect(window.location.search).toBe(''))
    setOpen(false)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    window.history.replaceState(null, '', '/medications?add')
    setOpen(true)
    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(name()).toHaveValue('')
    expect(screen.queryByText(note)).not.toBeInTheDocument()
  },
)

test('dismissing clears a failed save so the next Add starts clean', async () => {
  server.use(
    http.post('/api/medicines', () => HttpResponse.json({ error: 'conflict' }, { status: 409 })),
  )
  const { user, setOpen } = openDrawer()
  await user.type(name(), 'Magnesium')
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name: 'Tablet' }))
  await user.click(screen.getByRole('button', { name: 'Save medication' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('A different version')
  await user.click(close())
  setOpen(false)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  setOpen(true)
  expect(await screen.findByRole('dialog')).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(name()).toBeEnabled()
})

test('navigation keeps the draft and returning restores it', async () => {
  const { user, setOpen } = openDrawer()
  await user.type(name(), 'Magnesium')
  setOpen(false)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  setOpen(true)
  expect(await screen.findByRole('dialog')).toBeVisible()
  expect(name()).toHaveValue('Magnesium')
  expect(screen.getByText(note)).toBeVisible()
})

test('every dismissal is refused while saving, and the save still hands off', async () => {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post('/api/medicines', async ({ request }) => {
      const payload = (await request.json()) as Medicine
      await held
      return HttpResponse.json({ medicines: [payload] })
    }),
  )
  const { user, onSaved } = openDrawer()
  await user.type(name(), 'Magnesium')
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name: 'Tablet' }))
  await user.click(screen.getByRole('button', { name: 'Save medication' }))
  expect(await screen.findByRole('button', { name: 'Saving medication...' })).toBeDisabled()
  expect(close()).toBeDisabled()
  await user.keyboard('{Escape}')
  await user.click(backdrop())
  expect(window.location.search).toBe('?add')
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(name()).toHaveValue('Magnesium')
  release()
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
})

test('one Add tap opens the Drawer before the medicine list is cached', async () => {
  window.history.replaceState(null, '', '/medications')
  const ui = (ready: boolean) => (
    <QueryClientProvider client={client}>
      <RouterContext.Provider
        value={{ prefetch: async () => {}, push: vi.fn() } as unknown as NextRouter}
      >
        <MedicationsHeader />
        <MedicationsSection initialNow="2026-11-16T08:00:00.000Z">
          {ready && <MedicationsReady />}
        </MedicationsSection>
      </RouterContext.Provider>
    </QueryClientProvider>
  )
  const view = render(ui(false))
  const user = userEvent.setup()
  await user.click(screen.getByRole('link', { name: 'Add a medication' }))
  expect(await screen.findByRole('dialog', { name: 'Add medication' })).toBeVisible()
  await user.type(name(), 'Magnesium')
  act(() => {
    client.setQueryData(medicineKeys.list(), [])
    client.setQueryData(scheduleKeys.snapshot(), {
      schedules: [],
      records: [],
      date: '2026-11-16',
      now: '2026-11-16T08:00:00.000Z',
    })
  })
  view.rerender(ui(true))
  expect(screen.getByRole('dialog', { name: 'Add medication' })).toBeVisible()
  expect(name()).toHaveValue('Magnesium')
  expect(screen.queryByText('Loading medications')).not.toBeInTheDocument()
})
