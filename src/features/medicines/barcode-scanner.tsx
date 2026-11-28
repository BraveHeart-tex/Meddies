'use client'

import { Dialog } from '@base-ui/react/dialog'
import type { IDetectedBarcode, IScannerError, IScannerHandle } from '@yudiel/react-qr-scanner'
import { CameraOff, Flashlight, InfoIcon, Keyboard, RotateCcw, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { type ComponentProps, type RefObject, useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { barcodeFormats, barcodeValue } from './barcode-value'

// Browser-only, and the decoder must stay out of first load: it loads when the Scanner opens.
const CameraScanner = dynamic(
  async () => {
    const { Scanner, setZXingModuleOverrides } = await import('@yudiel/react-qr-scanner')
    // Copied to public/ by next.config.ts, in place of the default jsDelivr URL.
    setZXingModuleOverrides({
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? `/zxing/${path}` : prefix + path,
    })
    return Scanner
  },
  { ssr: false },
)

type CameraScannerProps = ComponentProps<typeof CameraScanner>

const noLibraryControls: CameraScannerProps['components'] = { finder: false, torch: false }
const fillCard: CameraScannerProps['styles'] = { container: { aspectRatio: 'auto' } }
// The library sizes its pause-frame canvas (its first canvas) to the card with no `object-fit`,
// so the frozen frame would stretch. Cover crops it like the live video.
const coverPauseFrame: CameraScannerProps['classNames'] = {
  container: '[&>canvas:first-of-type]:object-cover',
}

// `unknown` and `type-error` also cover a detector failure, where the camera itself is still on.
const cameraOffKinds = new Set<IScannerError['kind']>([
  'permission-denied',
  'security',
  'no-camera',
  'in-use',
  'overconstrained',
  'insecure-context',
  'unsupported',
  'aborted',
])

const frameCorners = [
  '-top-0.5 -left-0.5 rounded-tl-[1.5rem] border-t-[4.5px] border-l-[4.5px]',
  '-top-0.5 -right-0.5 rounded-tr-[1.5rem] border-t-[4.5px] border-r-[4.5px]',
  '-bottom-0.5 -left-0.5 rounded-bl-[1.5rem] border-b-[4.5px] border-l-[4.5px]',
  '-right-0.5 -bottom-0.5 rounded-br-[1.5rem] border-r-[4.5px] border-b-[4.5px]',
]

/** How long the camera runs with no read before the guidance asks for a flatter, closer pack. */
const stallMs = 8000

/** What the caller made of a read: a match closes the Scanner, the rest freeze it with an alert. */
export type ScannerReadOutcome = 'match' | 'noMatch' | 'failed'

type Phase = 'scanning' | 'looking' | Exclude<ScannerReadOutcome, 'match'>

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean }
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean }

function torchTrack(stream: MediaStream): MediaStreamTrack | null {
  const [track] = stream.getVideoTracks()
  const capabilities = track?.getCapabilities?.() as TorchCapabilities | undefined
  return capabilities?.torch ? track : null
}

/**
 * Full-cover camera (`193·B·Scanner`) that reports the first supported read through `onRead`
 * (`barcodeValue`) and freezes on it while the caller looks it up; other reads are ignored. A `match` is the caller's to close; `noMatch` shows `B·No match`
 * and `failed` a lookup alert that never claims the barcode is unknown, both with Scan again.
 * The caller unmounts it on match or close, and unmounting or freezing stops every camera track.
 */
export function BarcodeScanner({
  onRead,
  onClose,
  onScanAgain,
  finalFocus,
}: {
  onRead: (value: string) => Promise<ScannerReadOutcome>
  onClose: () => void
  /** Runs inside the Scan again tap, for work that needs a user gesture. */
  onScanAgain?: () => void
  /** Where focus goes when the Scanner closes, in place of the control that opened it. */
  finalFocus?: RefObject<HTMLElement | null>
}) {
  const [cameraOff, setCameraOff] = useState(false)
  const [torch, setTorch] = useState<MediaStreamTrack | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [phase, setPhase] = useState<Phase>('scanning')
  const [barcode, setBarcode] = useState('')
  const [stalled, setStalled] = useState(false)
  const scanner = useRef<IScannerHandle>(null)
  const hasRead = useRef(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const paused = phase !== 'scanning'
  const stopped = phase === 'noMatch' || phase === 'failed'

  // The library has no camera-ready callback; it exposes the stream once capabilities settle.
  // The stall clock starts then, and restarts with the camera after Scan again.
  useEffect(() => {
    if (cameraOff || paused) return
    let stall: ReturnType<typeof setTimeout> | undefined
    const poll = setInterval(() => {
      const stream = scanner.current?.getStream()
      if (!stream) return
      clearInterval(poll)
      setTorch(torchTrack(stream))
      stall = setTimeout(() => setStalled(true), stallMs)
    }, 200)
    return () => {
      clearInterval(poll)
      clearTimeout(stall)
    }
  }, [cameraOff, paused])

  // Reads are validated before the Scanner freezes: an unsupported one leaves the camera running.
  async function handleScan(codes: IDetectedBarcode[]) {
    if (hasRead.current) return
    const value = codes.map(barcodeValue).find((candidate) => candidate !== null)
    if (!value) return
    hasRead.current = true
    setBarcode(value)
    setPhase('looking')
    setStalled(false)
    setTorch(null)
    setTorchOn(false)
    const outcome = await onRead(value)
    if (outcome !== 'match') setPhase(outcome)
  }

  function scanAgain() {
    onScanAgain?.()
    hasRead.current = false
    setPhase('scanning')
  }

  function handleError(error: IScannerError) {
    if (cameraOffKinds.has(error.kind)) setCameraOff(true)
  }

  async function toggleTorch() {
    if (!torch) return
    const next = !torchOn
    const advanced: TorchConstraintSet[] = [{ torch: next }]
    try {
      await torch.applyConstraints({ advanced })
      setTorchOn(next)
    } catch {
      // The track refused or just ended. The button keeps showing the real state.
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Popup
          initialFocus={titleRef}
          finalFocus={finalFocus}
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background px-5 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] outline-none"
        >
          <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col gap-4">
            <div className="-mx-2 grid min-h-12 shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center text-center">
              <Dialog.Close
                render={<Button variant="ghost" size="icon" className="rounded-full" />}
                aria-label="Close scanner"
              >
                <X aria-hidden="true" />
              </Dialog.Close>
              <Dialog.Title
                ref={titleRef}
                tabIndex={-1}
                className="text-heading font-extrabold outline-none"
              >
                Scan the pack
              </Dialog.Title>
              {torch && !cameraOff && !paused && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label="Torch"
                  aria-pressed={torchOn}
                  onClick={toggleTorch}
                >
                  <Flashlight aria-hidden="true" />
                </Button>
              )}
            </div>

            <div
              aria-busy={phase === 'looking'}
              className={cn(
                'relative min-h-60 shrink-0 overflow-hidden rounded-3xl bg-camera-ground',
                stopped ? 'h-100' : 'h-119',
              )}
            >
              {cameraOff ? (
                <div className="grid size-full place-items-center text-white">
                  <CameraOff aria-hidden="true" className="size-8" />
                </div>
              ) : (
                <>
                  <CameraScanner
                    ref={scanner}
                    onScan={(codes) => void handleScan(codes)}
                    onError={handleError}
                    paused={paused}
                    formats={barcodeFormats}
                    components={noLibraryControls}
                    styles={fillCard}
                    classNames={coverPauseFrame}
                    sound={false}
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-1/2 h-40 w-74 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] shadow-[0_0_0_1000px_var(--color-camera-scrim)]"
                  >
                    {frameCorners.map((corner) => (
                      <span
                        key={corner}
                        className={cn(
                          'absolute size-9.5',
                          stopped ? 'border-camera-frame-stopped' : 'border-white',
                          corner,
                        )}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {cameraOff ? (
              <p
                role="alert"
                className="shrink-0 px-4 py-1 text-center text-body-lg font-extrabold"
              >
                Camera unavailable. Enter the medication details instead.
              </p>
            ) : stopped ? (
              <Alert className="shrink-0 border-0 bg-dose-unlogged text-dose-unlogged-foreground *:[svg]:size-5.5">
                <InfoIcon aria-hidden="true" />
                <AlertTitle className="text-body-lg">
                  {phase === 'noMatch'
                    ? "Meddies doesn't know this barcode yet"
                    : "Couldn't look up this barcode"}
                </AlertTitle>
                <AlertDescription className="text-body-sm text-foreground">
                  {phase === 'noMatch'
                    ? `You can type the details from the pack. Barcode ${barcode}.`
                    : 'Scan again, or type the details from the pack.'}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex shrink-0 flex-col gap-3.5 px-4 py-1 text-center">
                <p aria-live="polite" className="text-heading font-extrabold">
                  {stalled
                    ? 'Hold the barcode flat and close, in good light. Or type the details.'
                    : 'Hold the barcode inside the frame'}
                </p>
              </div>
            )}

            {stopped ? (
              <div className="mt-auto flex shrink-0 flex-col gap-1">
                <Button size="drawer" className="w-full" onClick={onClose}>
                  Type it in
                </Button>
                <Button variant="ghost" className="min-h-11 w-full" onClick={scanAgain}>
                  <RotateCcw aria-hidden="true" data-icon="inline-start" />
                  Scan again
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="drawer"
                className="mt-auto w-full shrink-0"
                onClick={onClose}
              >
                <Keyboard aria-hidden="true" data-icon="inline-start" />
                Type it in instead
              </Button>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
