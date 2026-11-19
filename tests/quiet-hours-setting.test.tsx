import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SettingsGroup } from '../src/app/settings/settings-list'
import { DeviceNotifications } from '../src/features/device-registrations/device-notifications'
import {
  NotificationDeviceProvider,
  type NotificationDevice,
} from '../src/features/device-registrations/notification-device'
import { QuietHoursSetting } from '../src/features/quiet-hours/quiet-hours-setting'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

const endpoint = '/api/quiet-hours'

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
})
afterEach(() => client.clear())

function renderQuietHours() {
  render(
    <QueryClientProvider client={client}>
      <SettingsGroup title="Notifications">
        <QuietHoursSetting />
      </SettingsGroup>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/** Quiet hours' row, which holds its own save alert. */
const group = () =>
  screen.getByText('Quiet hours · 23:00-08:00').closest<HTMLElement>('[role="listitem"]')!
const toggle = () => screen.getByRole('switch', { name: 'Quiet hours on all your devices' })

/** Answers every read with the saved value. */
function savedValue(quietHours: boolean) {
  server.use(http.get(endpoint, () => HttpResponse.json({ quietHours })))
}

/** Records every save body; `respond` answers each in order. */
function saves(...respond: (() => Promise<Response> | Response)[]) {
  const bodies: { actionId: string; quietHours: boolean }[] = []
  server.use(
    http.put(endpoint, async ({ request }) => {
      bodies.push((await request.json()) as (typeof bodies)[number])
      return (respond[bodies.length - 1] ?? respond.at(-1)!)()
    }),
  )
  return bodies
}

test('an account that never turned them on shows the window, Off and the line', async () => {
  savedValue(false)
  renderQuietHours()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  expect(await within(group()).findByText('Off')).toBeVisible()
  expect(
    within(group()).getByText(
      'Dose reminders still go out on time. Follow-ups are skipped, not sent later.',
    ),
  ).toBeVisible()
  expect(toggle()).not.toBeChecked()
  expect(toggle()).not.toHaveAttribute('aria-disabled', 'true')
})

test('Turn on shows Turning on with the switch off and disabled, and On only after the server confirms', async () => {
  savedValue(false)
  let confirm!: () => void
  const bodies = saves(async () => {
    await new Promise<void>((resolve) => (confirm = resolve))
    return HttpResponse.json({ quietHours: true })
  })
  const user = renderQuietHours()

  await user.click(await screen.findByRole('switch', { checked: false }))
  expect(await screen.findByText('Turning on...')).toBeVisible()
  expect(toggle()).not.toBeChecked()
  expect(toggle()).toHaveAttribute('aria-disabled', 'true')
  await waitFor(() => expect(bodies).toHaveLength(1))
  expect(bodies[0]).toEqual({ actionId: expect.any(String), quietHours: true })
  expect(screen.queryByText('On')).not.toBeInTheDocument()

  confirm()
  expect(await screen.findByText('On')).toBeVisible()
  expect(toggle()).toBeChecked()
})

test('an unknown result keeps Off under its alert, and the retry reuses the action ID', async () => {
  savedValue(false)
  const bodies = saves(
    () => new HttpResponse(null, { status: 503 }),
    () => HttpResponse.json({ quietHours: true }),
  )
  const user = renderQuietHours()

  await user.click(await screen.findByRole('switch', { checked: false }))
  const alert = await within(group()).findByRole('alert')
  expect(alert).toHaveTextContent('That might not have saved.')
  expect(alert).toHaveTextContent(
    "Check your connection, then retry. Retrying won't save it twice.",
  )
  expect(within(group()).getByText('Off')).toBeVisible()
  expect(toggle()).not.toBeChecked()

  await user.click(toggle())
  expect(await screen.findByText('On')).toBeVisible()
  expect(bodies).toHaveLength(2)
  expect(bodies[1]).toEqual(bodies[0])
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test.each([
  { saved: false, word: 'Off', title: 'Quiet hours aren’t on.' },
  { saved: true, word: 'On', title: 'Quiet hours aren’t off.' },
])('a rejected save keeps $word and says "$title"', async ({ saved, word, title }) => {
  savedValue(saved)
  saves(() => HttpResponse.json({ error: 'validation' }, { status: 400 }))
  const user = renderQuietHours()

  await user.click(await screen.findByRole('switch', { checked: saved }))
  const alert = await within(group()).findByRole('alert')
  expect(alert).toHaveTextContent(title)
  expect(alert).toHaveTextContent('Check your connection and try again.')
  expect(within(group()).getByText(word)).toBeVisible()
  if (saved) expect(toggle()).toBeChecked()
  else expect(toggle()).not.toBeChecked()
})

test('known offline disables the switch and says to connect', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  savedValue(true)
  renderQuietHours()
  expect(await within(group()).findByText('Connect to turn off.')).toBeVisible()
  expect(toggle()).toHaveAttribute('aria-disabled', 'true')
  vi.restoreAllMocks()
})

test('the switch stays changeable when this device cannot receive notifications', async () => {
  savedValue(true)
  saves(() => HttpResponse.json({ quietHours: false }))
  const device = {
    support: () => 'unsupported',
    permission: () => 'default',
    requestPermission: async () => 'default',
    installation: () => Promise.reject(new Error('unsupported')),
    registration: () => Promise.reject(new Error('unsupported')),
  } satisfies NotificationDevice
  render(
    <QueryClientProvider client={client}>
      <NotificationDeviceProvider value={device}>
        <DeviceNotifications />
        <QuietHoursSetting />
      </NotificationDeviceProvider>
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  expect(await screen.findByText('Not available in this browser')).toBeVisible()
  expect(
    await screen.findByRole('switch', { name: 'Quiet hours on all your devices', checked: true }),
  ).toBeVisible()

  await user.click(toggle())
  expect(await within(group()).findByText('Off')).toBeVisible()
  expect(toggle()).not.toBeChecked()
})
