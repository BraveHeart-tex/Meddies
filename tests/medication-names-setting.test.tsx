import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SettingsGroup } from '../src/app/settings/settings-list'
import { SettingsScreen } from '../src/app/settings/settings-screen'
import {
  NotificationDeviceProvider,
  type NotificationDevice,
  type NotificationSupport,
} from '../src/features/device-registrations/notification-device'
import { MedicationNamesSetting } from '../src/features/medication-names/medication-names-setting'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const endpoint = '/api/medication-names'
const switchName = 'Medication names in reminders on all your devices'
const effect = 'On, reminders name your medications, so they can show on your lock screen.'

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
})
afterEach(() => client.clear())

/** A device that can't receive notifications, or one that can and hasn't been asked. */
function device(support: NotificationSupport): NotificationDevice {
  return {
    support: () => support,
    permission: () => 'default',
    requestPermission: async () => 'default',
    installation: () => Promise.reject(new Error('no installation')),
    registration: () => Promise.reject(new Error('no registration')),
  }
}

/** Settings as the page renders it, with Quiet hours saved off. */
function renderSettings(support: NotificationSupport = 'browser') {
  server.use(http.get('/api/quiet-hours', () => HttpResponse.json({ quietHours: false })))
  render(
    <QueryClientProvider client={client}>
      <NotificationDeviceProvider value={device(support)}>
        <SettingsScreen expires="2026-11-16T07:00:00.000Z" now="2026-11-15T07:00:00.000Z" />
      </NotificationDeviceProvider>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

function renderNames() {
  render(
    <QueryClientProvider client={client}>
      <SettingsGroup title="Notifications">
        <MedicationNamesSetting />
      </SettingsGroup>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/** Names in reminders' row, which holds its own save alert. */
const row = () => screen.getByText('Names in reminders').closest<HTMLElement>('[role="listitem"]')!
const toggle = () => screen.getByRole('switch', { name: switchName })

/** Answers every read with the saved value. */
function savedValue(medicationNames: boolean) {
  server.use(http.get(endpoint, () => HttpResponse.json({ medicationNames })))
}

/** Records every save body; `respond` answers each in order. */
function saves(...respond: (() => Promise<Response> | Response)[]) {
  const bodies: { actionId: string; medicationNames: boolean }[] = []
  server.use(
    http.put(endpoint, async ({ request }) => {
      bodies.push((await request.json()) as (typeof bodies)[number])
      return (respond[bodies.length - 1] ?? respond.at(-1)!)()
    }),
  )
  return bodies
}

test('one Notifications group holds This device, Quiet hours and Names in reminders Off, with the note', async () => {
  savedValue(false)
  renderSettings()
  await screen.findByRole('switch', { name: switchName })
  const group = screen.getByRole('heading', { name: 'Notifications' }).closest('section')!
  expect(screen.queryByRole('heading', { name: 'Quiet hours' })).not.toBeInTheDocument()
  const rows = within(group).getAllByRole('listitem')
  expect(rows.map((item) => item.querySelector('[data-slot="item-title"]')?.textContent)).toEqual([
    'This device',
    'Quiet hours · 23:00-08:00',
    'Names in reminders',
  ])
  expect(within(row()).getByText('Off')).toBeVisible()
  expect(within(row()).getByText(effect)).toBeVisible()
  expect(
    within(group).getByText('Quiet hours and medication names apply to all your devices.'),
  ).toBeVisible()
  expect(toggle()).not.toBeChecked()
  expect(toggle()).not.toHaveAttribute('aria-disabled', 'true')
})

test('a reload shows the saved On from another device', async () => {
  savedValue(true)
  renderNames()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  expect(await within(row()).findByText('On')).toBeVisible()
  expect(toggle()).toBeChecked()
})

test('Turn on shows Turning on with the switch off and disabled, and On only after the server confirms', async () => {
  savedValue(false)
  let confirm!: () => void
  const bodies = saves(async () => {
    await new Promise<void>((resolve) => (confirm = resolve))
    return HttpResponse.json({ medicationNames: true })
  })
  const user = renderNames()

  await user.click(await screen.findByRole('switch', { checked: false }))
  expect(await within(row()).findByText('Turning on...')).toBeVisible()
  expect(toggle()).not.toBeChecked()
  expect(toggle()).toHaveAttribute('aria-disabled', 'true')
  await waitFor(() => expect(bodies).toHaveLength(1))
  expect(bodies[0]).toEqual({ actionId: expect.any(String), medicationNames: true })
  expect(within(row()).queryByText('On')).not.toBeInTheDocument()

  confirm()
  expect(await within(row()).findByText('On')).toBeVisible()
  expect(toggle()).toBeChecked()
})

test('an unknown result keeps Off under its alert in the row, and the retry reuses the action ID', async () => {
  savedValue(false)
  const bodies = saves(
    () => new HttpResponse(null, { status: 503 }),
    () => HttpResponse.json({ medicationNames: true }),
  )
  const user = renderNames()

  await user.click(await screen.findByRole('switch', { checked: false }))
  const alert = await within(row()).findByRole('alert')
  expect(alert).toHaveTextContent('That might not have saved.')
  expect(alert).toHaveTextContent(
    "Check your connection, then retry. Retrying won't save it twice.",
  )
  expect(within(row()).getByText('Off')).toBeVisible()
  expect(toggle()).not.toBeChecked()

  await user.click(toggle())
  expect(await within(row()).findByText('On')).toBeVisible()
  expect(bodies).toHaveLength(2)
  expect(bodies[1]).toEqual(bodies[0])
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test.each([
  { saved: false, word: 'Off', title: 'Medication names aren’t on.' },
  { saved: true, word: 'On', title: 'Medication names aren’t off.' },
])('a rejected save keeps $word and says "$title"', async ({ saved, word, title }) => {
  savedValue(saved)
  saves(() => HttpResponse.json({ error: 'validation' }, { status: 400 }))
  const user = renderNames()

  await user.click(await screen.findByRole('switch', { checked: saved }))
  const alert = await within(row()).findByRole('alert')
  expect(alert).toHaveTextContent(title)
  expect(alert).toHaveTextContent('Check your connection and try again.')
  expect(within(row()).getByText(word)).toBeVisible()
  if (saved) expect(toggle()).toBeChecked()
  else expect(toggle()).not.toBeChecked()
})

test('the switch stays visible and changeable when this device cannot receive notifications', async () => {
  savedValue(true)
  saves(() => HttpResponse.json({ medicationNames: false }))
  const user = renderSettings('unsupported')
  expect(await screen.findByText('Not available in this browser')).toBeVisible()
  expect(await screen.findByRole('switch', { name: switchName, checked: true })).toBeVisible()

  await user.click(toggle())
  expect(await within(row()).findByText('Off')).toBeVisible()
  expect(toggle()).not.toBeChecked()
})
