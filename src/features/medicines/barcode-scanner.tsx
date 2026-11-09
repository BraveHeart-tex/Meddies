'use client'

import { Dialog } from '@base-ui/react/dialog'
import type { IDetectedBarcode, IScannerError, IScannerHandle } from '@yudiel/react-qr-scanner'
import { CameraOff, Flashlight, Keyboard, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { type ComponentProps, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { barcodeValue } from './barcode-value'

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

const formats: CameraScannerProps['formats'] = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix']
const noLibraryControls: CameraScannerProps['components'] = { finder: false, torch: false }
const fillCard: CameraScannerProps['styles'] = { container: { aspectRatio: 'auto' } }

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

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean }
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean }

function torchTrack(stream: MediaStream): MediaStreamTrack | null {
  const [track] = stream.getVideoTracks()
  const capabilities = track?.getCapabilities?.() as TorchCapabilities | undefined
  return capabilities?.torch ? track : null
}

/**
 * Full-cover camera (`B·Scanner`) that reports one barcode through `onRead`. The caller unmounts it
 * on read or close, and unmounting stops every camera track.
 */
export function BarcodeScanner({
  onRead,
  onClose,
}: {
  onRead: (value: string) => void
  onClose: () => void
}) {
  const [cameraOff, setCameraOff] = useState(false)
  const [torch, setTorch] = useState<MediaStreamTrack | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const scanner = useRef<IScannerHandle>(null)
  const hasRead = useRef(false)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // The library has no camera-ready callback; it exposes the stream once capabilities settle.
  useEffect(() => {
    if (cameraOff) return
    const poll = setInterval(() => {
      const stream = scanner.current?.getStream()
      if (!stream) return
      clearInterval(poll)
      setTorch(torchTrack(stream))
    }, 200)
    return () => clearInterval(poll)
  }, [cameraOff])

  function handleScan([code]: IDetectedBarcode[]) {
    if (!code || hasRead.current) return
    hasRead.current = true
    onRead(barcodeValue(code))
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
              {torch && !cameraOff && (
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

            <div className="relative h-119 min-h-60 overflow-hidden rounded-3xl bg-camera-ground">
              {cameraOff ? (
                <div className="grid size-full place-items-center text-white">
                  <CameraOff aria-hidden="true" className="size-8" />
                </div>
              ) : (
                <>
                  <CameraScanner
                    ref={scanner}
                    onScan={handleScan}
                    onError={handleError}
                    formats={formats}
                    components={noLibraryControls}
                    styles={fillCard}
                    sound={false}
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-1/2 h-40 w-74 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] shadow-[0_0_0_1000px_var(--color-camera-scrim)]"
                  >
                    {frameCorners.map((corner) => (
                      <span key={corner} className={cn('absolute size-9.5 border-white', corner)} />
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
                Camera is off for Meddies. Turn it on in iPhone Settings, or type the details.
              </p>
            ) : (
              <div className="flex shrink-0 flex-col gap-3.5 px-4 py-1 text-center">
                <p className="text-heading font-extrabold">Hold the barcode inside the frame</p>
                <p className="text-body-sm text-muted-foreground">
                  It reads on its own, usually from the back or side of the box.
                </p>
              </div>
            )}

            <Button
              variant="outline"
              size="drawer"
              className="mt-auto w-full shrink-0"
              onClick={onClose}
            >
              <Keyboard aria-hidden="true" data-icon="inline-start" />
              Type it in instead
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
