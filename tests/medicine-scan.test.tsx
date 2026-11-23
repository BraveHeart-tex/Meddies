import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, onTestFinished, test, vi } from 'vitest'
import { MedicineAddDrawer } from '../src/features/medicines/medicine-add-drawer'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

// The Scan the pack flow in Add medicine (#198). The camera library is replaced by a stand-in
// whose Read barcode button reports one EAN-13; tests/barcode-scanner.test.tsx covers the real
// camera, torch and stall clock.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/medications',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

// App Router builds alias next/dynamic to this module; only it passes the ref to the Scanner.
vi.mock('next/dynamic', async () => ({
  default: (await vi.importActual<{ default: unknown }>('next/dist/shared/lib/app-dynamic.js'))
    .default,
}))

vi.mock('@yudiel/react-qr-scanner', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  const stream = { getVideoTracks: () => [], getTracks: () => [] }
  type Props = {
    onScan: (codes: { format: string; rawValue: string }[]) => void
    paused?: boolean
  }
  return {
    setZXingModuleOverrides: () => undefined,
    Scanner: forwardRef<unknown, Props>(function CameraStandIn({ onScan, paused }, ref) {
      useImperativeHandle(ref, () => ({
        getStream: () => (paused ? null : stream),
        getVideoElement: () => null,
      }))
      return paused ? (
        <p>Frozen frame</p>
      ) : (
        <button
          type="button"
          onClick={() => onScan([{ format: 'ean_13', rawValue: '8699536090115' }])}
        >
          Read barcode
        </button>
      )
    }),
  }
})

let client: QueryClient
let posts: unknown[]
beforeEach(() => {
  client = createQueryClient()
  posts = []
  window.history.replaceState(null, '', '/medications?add')
  server.use(
    http.post('/api/medicines', async ({ request }) => {
      posts.push(await request.json())
      return HttpResponse.json({ error: 'validation' }, { status: 400 })
    }),
  )
})
afterEach(() => {
  client.clear()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

function lookupAnswers(answer: () => Response | Promise<Response>) {
  const barcodes: (string | null)[] = []
  server.use(
    http.get('/api/catalog-products', ({ request }) => {
      barcodes.push(new URL(request.url).searchParams.get('barcode'))
      return answer()
    }),
  )
  return barcodes
}

const match = {
  outcome: 'match',
  name: 'MAJEZIK',
  strength: '100 mg',
  type: 'tablet',
  supportedForm: true,
}

function openDrawer() {
  render(
    <QueryClientProvider client={client}>
      <MedicineAddDrawer open returnFocus={false} onSaved={vi.fn()} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const name = () => screen.getByRole('textbox', { name: 'Name' })
const strength = () => screen.getByRole('textbox', { name: 'Strength' })
const type = () => screen.getByRole('combobox', { name: 'Type' })
const scanRow = () => screen.getByRole('button', { name: 'Scan the pack' })
const scanner = () => screen.queryByRole('dialog', { name: 'Scan the pack' })

async function scanBarcode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(scanRow())
  await user.click(await screen.findByRole('button', { name: 'Read barcode' }))
}

test('the Scan row comes first with the camera help line, and opens the Scanner', async () => {
  const user = openDrawer()
  const form = name().closest('form')!
  expect(form.firstElementChild).toContainElement(scanRow())
  expect(scanRow()).toHaveAccessibleDescription(
    'Fills in the name and strength Meddies uses the camera only to read the barcode. Nothing saves until you do.',
  )
  await user.click(scanRow())
  expect(await screen.findByRole('heading', { name: 'Scan the pack' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Close scanner' }))
  await waitFor(() => expect(scanner()).not.toBeInTheDocument())
  expect(screen.getByRole('dialog', { name: 'Add medication' })).toBeInTheDocument()
})

test('while known offline the Scan row is disabled and the form still works', async () => {
  const user = openDrawer()
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  fireEvent(window, new Event('offline'))
  onTestFinished(() => {
    online.mockReturnValue(true)
    fireEvent(window, new Event('online'))
  })
  expect(scanRow()).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent("You're offline.")
  await user.type(name(), 'Vitamin D3')
  expect(name()).toHaveValue('Vitamin D3')
  await user.click(type())
  await user.click(await screen.findByRole('option', { name: 'Capsule' }))
  expect(type()).toHaveTextContent('Capsule')
  expect(screen.getByRole('button', { name: 'Connect to save' })).toBeDisabled()
})

test('a full match returns to Barcode read with editable details and writes nothing until Save', async () => {
  const barcodes = lookupAnswers(() => HttpResponse.json(match))
  const user = openDrawer()
  await scanBarcode(user)
  await waitFor(() => expect(scanner()).not.toBeInTheDocument())
  expect(barcodes).toEqual(['8699536090115'])
  expect(screen.getByRole('status')).toHaveTextContent('Barcode readCheck these match your pack')
  expect(screen.getByRole('button', { name: 'Scan again' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Scan the pack' })).not.toBeInTheDocument()
  expect(name()).toHaveValue('MAJEZIK')
  expect(strength()).toHaveValue('100 mg')
  expect(type()).toHaveTextContent('Tablet')
  expect(posts).toEqual([])

  await user.clear(strength())
  await user.type(strength(), '200 mg')
  expect(posts).toEqual([])
  await user.click(screen.getByRole('button', { name: 'Save medication' }))
  await waitFor(() => expect(posts).toHaveLength(1))
  expect(posts[0]).toMatchObject({ label: 'MAJEZIK', strength: '200 mg', unit: 'tablet' })
})

test('an unknown barcode shows No match, and Type it in returns to an empty form', async () => {
  lookupAnswers(() => HttpResponse.json({ outcome: 'noMatch' }))
  const user = openDrawer()
  await scanBarcode(user)
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent("Meddies doesn't know this barcode yet")
  expect(alert).toHaveTextContent('You can type the details from the pack. Barcode 8699536090115.')
  expect(screen.getByText('Frozen frame')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Scan again' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Type it in' }))
  await waitFor(() => expect(scanner()).not.toBeInTheDocument())
  expect(name()).toHaveValue('')
  expect(strength()).toHaveValue('')
  expect(type()).toHaveTextContent('Choose')
  expect(scanRow()).toBeEnabled()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(posts).toEqual([])
})

test.each([
  ['a server error', () => HttpResponse.json({ error: 'unavailable' }, { status: 503 })],
  ['a lost connection', () => HttpResponse.error()],
])(
  'a lookup that ends in %s keeps the Scanner usable without calling the barcode unknown',
  async (_, answer) => {
    const barcodes = lookupAnswers(answer)
    const user = openDrawer()
    await scanBarcode(user)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't look up this barcode")
    expect(alert).toHaveTextContent('Scan again, or type the details from the pack.')
    expect(screen.queryByText(/doesn't know this barcode/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Scan again' }))
    await user.click(await screen.findByRole('button', { name: 'Read barcode' }))
    await screen.findByRole('alert')
    expect(barcodes).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Type it in' }))
    await waitFor(() => expect(scanner()).not.toBeInTheDocument())
    expect(name()).toHaveValue('')
  },
)

test('closing the Scanner during a lookup fills nothing when the answer arrives', async () => {
  let answer!: (response: Response) => void
  lookupAnswers(() => new Promise<Response>((resolve) => (answer = resolve)))
  const user = openDrawer()
  await scanBarcode(user)
  await waitFor(() => expect(answer).toBeDefined())
  await user.click(screen.getByRole('button', { name: 'Close scanner' }))
  await waitFor(() => expect(scanner()).not.toBeInTheDocument())
  await act(async () => answer(HttpResponse.json(match)))
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  expect(name()).toHaveValue('')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

// #474 Partial and unsupported-form matches (473·B1-B4).
const note = "Meddies doesn't track this form yet. You can still save it with the closest type."
const partial = { ...match, name: 'DELIX FORTE', strength: '5 mg/5 mg', type: null }
const nameOnly = { ...match, name: 'SYSTANE ULTRA', strength: null, type: null }
const unsupported = {
  ...match,
  name: 'HIRUDOID FORTE',
  strength: '0.445%',
  type: null,
  supportedForm: false,
}
const stock = () => screen.getByRole('textbox', { name: 'Stock' })

test.each([
  ['a partial match (473·B1)', partial, '5 mg/5 mg'],
  ['a Name-only match (473·B2)', nameOnly, ''],
])(
  '%s fills only what it returned, leaves Type unset and saves nothing until Save',
  async (_, answer, filledStrength) => {
    lookupAnswers(() => HttpResponse.json(answer))
    const user = openDrawer()
    await scanBarcode(user)
    await waitFor(() => expect(scanner()).not.toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('Barcode readCheck these match your pack')
    expect(name()).toHaveValue(answer.name)
    expect(strength()).toHaveValue(filledStrength)
    expect(type()).toHaveTextContent('Choose')
    expect(stock()).toHaveValue('')
    expect(screen.queryByText(note)).not.toBeInTheDocument()
    expect(type()).not.toHaveAccessibleDescription(note)

    await user.type(name(), ' 2')
    await user.type(strength(), '0')
    await user.click(type())
    await user.click(await screen.findByRole('option', { name: 'Drops' }))
    expect(posts).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Save medication' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({
      label: `${answer.name} 2`,
      strength: `${filledStrength}0`,
      unit: 'drops',
    })
  },
)

test('an unsupported form fills Name and Strength and notes it under Type, also with the menu open (473·B3, B4)', async () => {
  lookupAnswers(() => HttpResponse.json(unsupported))
  const user = openDrawer()
  await scanBarcode(user)
  await waitFor(() => expect(scanner()).not.toBeInTheDocument())
  expect(screen.getByRole('status')).toHaveTextContent('Barcode readCheck these match your pack')
  expect(name()).toHaveValue('HIRUDOID FORTE')
  expect(strength()).toHaveValue('0.445%')
  expect(type()).toHaveTextContent('Choose')
  expect(type()).toHaveAccessibleDescription(note)
  expect(screen.getByText(note)).toBeVisible()
  expect(posts).toEqual([])

  await user.click(type())
  expect(await screen.findByRole('listbox')).toBeVisible()
  expect(screen.getByText(note)).toBeVisible()
  await user.click(screen.getByRole('option', { name: 'Liquid' }))
  expect(type()).toHaveTextContent('Liquid')
  expect(type()).toHaveAccessibleDescription(note)
  expect(posts).toEqual([])
})

test('the unsupported-form note goes with Scan again for a supported form', async () => {
  let answer: object = unsupported
  lookupAnswers(() => HttpResponse.json(answer))
  const user = openDrawer()
  await scanBarcode(user)
  expect(await screen.findByText(note)).toBeVisible()

  // The stand-in reads the same barcode again, so drop its cached lookup.
  answer = partial
  client.clear()
  await user.click(screen.getByRole('button', { name: 'Scan again' }))
  await user.click(await screen.findByRole('button', { name: 'Read barcode' }))
  await waitFor(() => expect(name()).toHaveValue('DELIX FORTE'))
  expect(screen.queryByText(note)).not.toBeInTheDocument()
  expect(type()).not.toHaveAccessibleDescription(note)
  expect(screen.getByRole('status')).toHaveTextContent('Barcode read')
})

test('the unsupported-form note goes with Clear form and with a save', async () => {
  lookupAnswers(() => HttpResponse.json(unsupported))
  server.use(
    http.post('/api/medicines', async ({ request }) => {
      const payload = await request.json()
      posts.push(payload)
      return HttpResponse.json({ medicines: [payload] })
    }),
  )
  // Clear form shows only for a restored session draft.
  let user = openDrawer()
  await user.type(name(), 'Draft')
  cleanup()
  user = openDrawer()
  expect(screen.getByText('Unsaved details restored.')).toBeVisible()
  await scanBarcode(user)
  expect(await screen.findByText(note)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Clear form' }))
  expect(screen.queryByText(note)).not.toBeInTheDocument()
  expect(name()).toHaveValue('')
  expect(scanRow()).toBeEnabled()

  await scanBarcode(user)
  expect(await screen.findByText(note)).toBeVisible()
  await user.click(type())
  await user.click(await screen.findByRole('option', { name: 'Liquid' }))
  await user.click(screen.getByRole('button', { name: 'Save medication' }))
  await waitFor(() => expect(posts).toHaveLength(1))
  await waitFor(() => expect(name()).toHaveValue(''))
  expect(screen.queryByText(note)).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

// #475 The match sound. jsdom has no Web Audio, so these tests stand in an AudioContext; without
// one, as in every test above, the Scanner works and stays silent.
type SoundTrouble = 'notReady' | 'blocked' | 'decodeFails' | 'startThrows'

function fakeAudio(trouble?: SoundTrouble) {
  const sound = { requests: 0, decoded: false, gains: [] as number[], starts: 0 }
  class FakeAudioContext {
    state: AudioContextState = 'suspended'
    destination = {}
    async resume() {
      if (trouble === 'blocked') throw new DOMException('Needs a gesture', 'NotAllowedError')
      this.state = 'running'
    }
    async close() {
      this.state = 'closed'
    }
    async decodeAudioData() {
      if (trouble === 'decodeFails') throw new DOMException('Bad file', 'EncodingError')
      sound.decoded = true
      return {}
    }
    createGain() {
      const node = { gain: { value: 1 }, connect: (next: unknown) => next }
      return node
    }
    createBufferSource() {
      return {
        buffer: null,
        connect: (gain: { gain: { value: number } }) => {
          sound.gains.push(gain.gain.value)
          return gain
        },
        start: () => {
          if (trouble === 'startThrows') throw new DOMException('Gone', 'InvalidStateError')
          sound.starts++
        },
      }
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext)
  const session = { type: 'auto' }
  Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true })
  let release = () => {}
  server.use(
    http.get('/sounds/scan-match.wav', () => {
      sound.requests++
      if (trouble !== 'notReady') return new HttpResponse(new ArrayBuffer(8))
      return new Promise<Response>((resolve) => {
        release = () => resolve(new HttpResponse(null, { status: 404 }))
      })
    }),
  )
  onTestFinished(() => {
    release()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'audioSession')
  })
  return { sound, session }
}

async function scanWithSound(
  user: ReturnType<typeof userEvent.setup>,
  sound: { requests: number; decoded: boolean },
  open = scanRow,
) {
  await user.click(open())
  await waitFor(() => expect(sound.requests).toBeGreaterThan(0))
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  await user.click(await screen.findByRole('button', { name: 'Read barcode' }))
}

test('a Catalog match, also for an unsupported form, plays the match sound once, and again after Scan again', async () => {
  let answer: object = unsupported
  lookupAnswers(() => HttpResponse.json(answer))
  const { sound, session } = fakeAudio()
  const user = openDrawer()
  await scanWithSound(user, sound)
  await waitFor(() => expect(scanner()).not.toBeInTheDocument())
  expect(name()).toHaveValue('HIRUDOID FORTE')
  expect(sound.decoded).toBe(true)
  expect(sound.starts).toBe(1)
  expect(sound.gains).toEqual([0.6])
  expect(session.type).toBe('ambient')

  answer = match
  client.clear()
  await scanWithSound(user, sound, () => screen.getByRole('button', { name: 'Scan again' }))
  await waitFor(() => expect(name()).toHaveValue('MAJEZIK'))
  expect(sound.starts).toBe(2)
  // Decoded once, when the Scanner first opened.
  expect(sound.requests).toBe(1)
})

test.each([
  ['no match', () => HttpResponse.json({ outcome: 'noMatch' })],
  ['a failed lookup', () => HttpResponse.json({ error: 'unavailable' }, { status: 503 })],
])('%s plays nothing, also after Scan again', async (_, answer) => {
  lookupAnswers(answer)
  const { sound } = fakeAudio()
  const user = openDrawer()
  await scanWithSound(user, sound)
  await screen.findByRole('alert')
  await user.click(screen.getByRole('button', { name: 'Scan again' }))
  await user.click(await screen.findByRole('button', { name: 'Read barcode' }))
  await screen.findByRole('alert')
  expect(sound.decoded).toBe(true)
  expect(sound.starts).toBe(0)
})

test('a lookup that ends after Close plays nothing', async () => {
  let answer!: (response: Response) => void
  lookupAnswers(() => new Promise<Response>((resolve) => (answer = resolve)))
  const { sound } = fakeAudio()
  const user = openDrawer()
  await scanWithSound(user, sound)
  await waitFor(() => expect(answer).toBeDefined())
  await user.click(screen.getByRole('button', { name: 'Close scanner' }))
  await waitFor(() => expect(scanner()).not.toBeInTheDocument())
  await act(async () => answer(HttpResponse.json(match)))
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  expect(name()).toHaveValue('')
  expect(sound.starts).toBe(0)
})

test.each<[string, SoundTrouble]>([
  ['not loaded yet', 'notReady'],
  ['blocked', 'blocked'],
  ['failing to decode', 'decodeFails'],
  ['failing to start', 'startThrows'],
])('a match sound %s stays silent and the match still fills at once', async (_, trouble) => {
  lookupAnswers(() => HttpResponse.json(match))
  const { sound } = fakeAudio(trouble)
  const user = openDrawer()
  await scanWithSound(user, sound)
  await waitFor(() => expect(scanner()).not.toBeInTheDocument())
  expect(name()).toHaveValue('MAJEZIK')
  expect(screen.getByRole('status')).toHaveTextContent('Barcode read')
  expect(sound.starts).toBe(0)
})
