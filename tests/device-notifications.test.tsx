import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DeviceNotifications } from '../src/features/device-registrations/device-notifications'
import {
  NotificationDeviceProvider,
  type NotificationDevice,
  type NotificationSupport,
} from '../src/features/device-registrations/notification-device'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

const installationId = 'cTestInstallation0001x'
const registration = { installationId, token: `${installationId}:APA91b-test-token-0001` }
const endpoint = '/api/device-registration'

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
})
afterEach(() => client.clear())

/** A controlled device; `requestPermission` answers with `answer` and keeps it. */
function fakeDevice(
  support: NotificationSupport,
  permission: NotificationPermission = 'default',
  answer: NotificationPermission = 'granted',
) {
  let current = permission
  const device = {
    support: () => support,
    permission: () => current,
    requestPermission: vi.fn(async () => (current = answer)),
    installation: vi.fn(async () => ({ installationId })),
    registration: vi.fn(async () => registration),
  } satisfies NotificationDevice
  return device
}

function renderSettingsGroup(device: NotificationDevice) {
  render(
    <QueryClientProvider client={client}>
      <NotificationDeviceProvider value={device}>
        <DeviceNotifications />
      </NotificationDeviceProvider>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const group = () => screen.getByRole('list')
const toggle = () => screen.getByRole('switch', { name: 'Notifications on this device' })
const step = (text: string) => within(group()).getByText(text)

/** Records every save body; `respond` answers each in order. */
function saves(...respond: (() => Promise<Response> | Response)[]) {
  const bodies: unknown[] = []
  server.use(
    http.put(endpoint, async ({ request }) => {
      bodies.push(await request.json())
      return (respond[bodies.length - 1] ?? respond.at(-1)!)()
    }),
  )
  return bodies
}

test.each([
  {
    name: 'a browser that cannot receive',
    device: fakeDevice('unsupported'),
    status: 'Not available in this browser',
    steps: [],
  },
  {
    name: 'iPhone Safari',
    device: fakeDevice('home-screen'),
    status: 'Needs Home Screen app',
    steps: [
      'In Safari, tap Share.',
      'Tap Add to Home Screen.',
      'Open Meddies from your Home Screen.',
    ],
  },
  {
    name: 'Blocked on iPhone',
    device: fakeDevice('iphone', 'denied'),
    status: 'Blocked',
    line: 'Meddies can’t ask again.',
    steps: [
      'Open iPhone Settings.',
      'Tap Notifications, then Meddies.',
      'Turn on Allow Notifications.',
    ],
  },
  {
    name: 'Blocked in a browser',
    device: fakeDevice('browser', 'denied'),
    status: 'Blocked',
    line: 'Meddies can’t ask again.',
    steps: [
      'In Chrome, tap the icon left of the address.',
      'Tap Permissions.',
      'Turn on Notifications.',
    ],
  },
])('$name shows "$status" with its steps and no switch', ({ device, status, line, steps }) => {
  renderSettingsGroup(device)
  expect(step(status)).toBeVisible()
  if (line) expect(step(line)).toBeVisible()
  for (const text of steps) expect(step(text)).toBeVisible()
  expect(within(group()).getAllByRole('listitem')).toHaveLength(steps.length + 1)
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  expect(device.requestPermission).not.toHaveBeenCalled()
})

test('Off shows the switch off and reads nothing', () => {
  renderSettingsGroup(fakeDevice('browser'))
  expect(step('Off')).toBeVisible()
  expect(step('Asks permission first.')).toBeVisible()
  expect(toggle()).not.toBeChecked()
  expect(toggle()).not.toHaveAttribute('aria-disabled', 'true')
})

test('On shows only once the server reports this device registered', async () => {
  let answer!: (registered: boolean) => void
  server.use(
    http.get(endpoint, async ({ request }) => {
      expect(new URL(request.url).searchParams.get('installationId')).toBe(installationId)
      return HttpResponse.json({ registered: await new Promise<boolean>((r) => (answer = r)) })
    }),
  )
  renderSettingsGroup(fakeDevice('browser', 'granted'))
  expect(within(group()).getByText('This device')).toBeVisible()
  expect(screen.queryByText(/^(On|Off)$/)).not.toBeInTheDocument()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  await waitFor(() => expect(answer).toBeDefined())
  answer(true)
  expect(await screen.findByText('On')).toBeVisible()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
})

test('Turn on asks from the tap, shows Turning on with the switch disabled, and On after the save', async () => {
  const device = fakeDevice('browser')
  let confirm!: () => void
  const bodies = saves(async () => {
    await new Promise<void>((resolve) => (confirm = resolve))
    return HttpResponse.json({ registered: true })
  })
  server.use(http.get(endpoint, () => HttpResponse.json({ registered: false })))
  const user = renderSettingsGroup(device)
  expect(device.requestPermission).not.toHaveBeenCalled()

  await user.click(toggle())
  expect(device.requestPermission).toHaveBeenCalledOnce()
  expect(await screen.findByText('Turning on...')).toBeVisible()
  expect(toggle()).not.toBeChecked()
  expect(toggle()).toHaveAttribute('aria-disabled', 'true')
  await waitFor(() => expect(bodies).toEqual([registration]))
  expect(screen.queryByText('On')).not.toBeInTheDocument()

  confirm()
  expect(await screen.findByText('On')).toBeVisible()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  expect(device.requestPermission).toHaveBeenCalledOnce()
})

test.each([
  { answer: 'denied' as const, status: 'Blocked', switch: false },
  { answer: 'default' as const, status: 'Off', switch: true },
])('a prompt answered $answer shows "$status" and saves nothing', async (example) => {
  const device = fakeDevice('browser', 'default', example.answer)
  const bodies = saves(() => HttpResponse.json({ registered: true }))
  const user = renderSettingsGroup(device)

  await user.click(toggle())
  await waitFor(() => expect(screen.queryByText('Turning on...')).not.toBeInTheDocument())
  expect(step(example.status)).toBeVisible()
  expect(screen.queryAllByRole('switch')).toHaveLength(example.switch ? 1 : 0)
  expect(device.registration).not.toHaveBeenCalled()
  expect(bodies).toEqual([])
})

test('a save that might not have saved keeps Off, and the next tap resends the same registration', async () => {
  const device = fakeDevice('browser')
  const bodies = saves(
    () => new HttpResponse(null, { status: 503 }),
    () => HttpResponse.json({ registered: true }),
  )
  server.use(http.get(endpoint, () => HttpResponse.json({ registered: false })))
  const user = renderSettingsGroup(device)

  await user.click(toggle())
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('That might not have saved.')
  expect(alert).toHaveTextContent(
    "Check your connection, then retry. Retrying won't save it twice.",
  )
  expect(step('Off')).toBeVisible()
  expect(toggle()).not.toBeChecked()

  await user.click(toggle())
  expect(await screen.findByText('On')).toBeVisible()
  expect(bodies).toEqual([registration, registration])
  expect(device.registration).toHaveBeenCalledOnce()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('a definite rejection keeps Off and says notifications are not on', async () => {
  saves(() => HttpResponse.json({ error: 'validation' }, { status: 400 }))
  server.use(http.get(endpoint, () => HttpResponse.json({ registered: false })))
  const user = renderSettingsGroup(fakeDevice('browser'))

  await user.click(toggle())
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Notifications aren’t on.')
  expect(alert).toHaveTextContent('Check your connection and try again.')
  expect(step('Off')).toBeVisible()
})

test('known offline disables the switch and says to connect', () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  renderSettingsGroup(fakeDevice('browser'))
  expect(step('Connect to turn on.')).toBeVisible()
  expect(toggle()).toHaveAttribute('aria-disabled', 'true')
  vi.restoreAllMocks()
})
