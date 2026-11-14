import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { designFrames } from '../src/features/design-lab/frames'
import { readDecoderWasm } from './helpers/barcode-decoder'
import { server } from './helpers/msw-server'

// App Router builds alias next/dynamic to this module; only it passes the ref to the Scanner.
vi.mock('next/dynamic', async () => ({
  default: (await vi.importActual<{ default: unknown }>('next/dist/shared/lib/app-dynamic.js'))
    .default,
}))

const decoder = readDecoderWasm()

const cameraReady = { timeout: 4_000 }
const getUserMedia = vi.fn<() => Promise<MediaStream>>()

function fakeTrack(capabilities: MediaTrackCapabilities & { torch?: boolean }) {
  return {
    getCapabilities: vi.fn(() => capabilities),
    getSettings: () => ({}),
    applyConstraints: vi.fn(async () => undefined),
    stop: vi.fn(),
  }
}

function fakeStream(...tracks: ReturnType<typeof fakeTrack>[]) {
  const live = [...tracks]
  return {
    getTracks: () => [...live],
    getVideoTracks: () => [...live],
    removeTrack: (track: ReturnType<typeof fakeTrack>) => live.splice(live.indexOf(track), 1),
  } as unknown as MediaStream
}

function renderScanner() {
  const frame = designFrames.find((entry) => entry.slug === '193-b-scanner')!
  render(frame.render())
  expect(frame.citation).toBe('193·B·Scanner')
}

const user = () =>
  userEvent.setup({ advanceTimers: (ms) => act(() => vi.advanceTimersByTimeAsync(ms)) })

/**
 * Once the camera request is made, skip the library's 500ms settle delay and the Scanner's
 * 200ms stream check instead of waiting them out.
 */
async function cameraStarted() {
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce(), cameraReady)
  await act(() => vi.advanceTimersByTimeAsync(700))
}

/** The library reads capabilities once, then the Scanner's torch check reads them again. */
async function torchChecked(track: ReturnType<typeof fakeTrack>) {
  await cameraStarted()
  await waitFor(
    () => expect(track.getCapabilities.mock.calls.length).toBeGreaterThan(1),
    cameraReady,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1 })
  getUserMedia.mockReset()
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockReturnValue()
  // jsdom has no canvas, and the library will not start the camera without a 2D context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  server.use(
    http.get(
      '*/zxing/:file',
      () => new HttpResponse(decoder, { headers: { 'Content-Type': 'application/wasm' } }),
    ),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('193·B·Scanner shows its copy and asks only for the camera', async () => {
  getUserMedia.mockResolvedValue(fakeStream(fakeTrack({})))
  renderScanner()
  expect(screen.getByRole('heading', { name: 'Scan the pack' })).toBeInTheDocument()
  expect(screen.getByText('Hold the barcode inside the frame')).toBeInTheDocument()
  expect(
    screen.getByText('It reads on its own, usually from the back or side of the box.'),
  ).toBeInTheDocument()
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce(), cameraReady)
  expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }))
})

test('denied camera access shows the Camera off copy and still offers typing', async () => {
  getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
  renderScanner()
  expect(await screen.findByRole('alert', {}, cameraReady)).toHaveTextContent(
    'Camera is off for Meddies. Turn it on in Settings, or type the details.',
  )
  expect(screen.queryByText('Hold the barcode inside the frame')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Torch' })).not.toBeInTheDocument()
  await user().click(screen.getByRole('button', { name: 'Type it in instead' }))
  expect(await screen.findByText('Scanner closed')).toBeInTheDocument()
})

test.each(['Close scanner', 'Type it in instead'])('%s stops every camera track', async (name) => {
  const tracks = [fakeTrack({}), fakeTrack({})]
  getUserMedia.mockResolvedValue(fakeStream(...tracks))
  renderScanner()
  await torchChecked(tracks[0]!)
  for (const track of tracks) expect(track.stop).not.toHaveBeenCalled()
  await user().click(screen.getByRole('button', { name }))
  await waitFor(() => {
    for (const track of tracks) expect(track.stop).toHaveBeenCalledOnce()
  }, cameraReady)
})

test('the torch shows when the camera track reports support, and switches it', async () => {
  const track = fakeTrack({ torch: true } as MediaTrackCapabilities)
  getUserMedia.mockResolvedValue(fakeStream(track))
  renderScanner()
  await cameraStarted()
  const torch = await screen.findByRole('button', { name: 'Torch' }, cameraReady)
  expect(torch).toHaveAttribute('aria-pressed', 'false')
  await user().click(torch)
  expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
  await waitFor(() => expect(torch).toHaveAttribute('aria-pressed', 'true'))
})

test('the torch stays hidden when the camera track does not report support', async () => {
  const track = fakeTrack({})
  getUserMedia.mockResolvedValue(fakeStream(track))
  renderScanner()
  await torchChecked(track)
  expect(screen.queryByRole('button', { name: 'Torch' })).not.toBeInTheDocument()
})
