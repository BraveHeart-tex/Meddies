'use client'

import { useQueryClient } from '@tanstack/react-query'
import { CheckIcon, ChevronRight, ScanBarcode } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CatalogMatch } from '@/features/catalog-products/contract'
import { catalogProductKeys, fetchCatalogLookup } from '@/features/catalog-products/queries'
import { BarcodeScanner, type ScannerReadOutcome } from './barcode-scanner'

/**
 * Add medicine's first row (docs/product/catalog-barcode.md#scope): *Scan the pack* with the camera
 * help line under it, seen before the camera prompt, opens the Scanner. A read looks up its Catalog
 * product (#196); a match hands it to `onMatch`, which only fills the form, and the row turns into
 * `B·Barcode read` while `read` holds. No match and a failed lookup stay on the Scanner.
 */
export function MedicineScan({
  read,
  disabled,
  onMatch,
}: {
  read: boolean
  /** Known offline or saving: the form's own state explains why. */
  disabled: boolean
  onMatch: (match: CatalogMatch) => void
}) {
  const client = useQueryClient()
  const [scanning, setScanning] = useState(false)
  // Each Scanner read or close moves this on, so a lookup that ends after Close fills nothing.
  const lookups = useRef(0)
  const rowRef = useRef<HTMLDivElement>(null)

  async function lookUp(barcode: string): Promise<ScannerReadOutcome> {
    const lookup = ++lookups.current
    try {
      const result = await client.fetchQuery({
        queryKey: catalogProductKeys.lookup(barcode),
        queryFn: ({ signal }) => fetchCatalogLookup(barcode, signal),
        retry: false,
        // Fails at once when the connection drops, instead of pausing on the frozen frame.
        networkMode: 'always',
      })
      if (lookup !== lookups.current) return 'failed'
      if (result.outcome === 'noMatch') return 'noMatch'
      onMatch(result)
      setScanning(false)
      return 'match'
    } catch {
      return 'failed'
    }
  }

  function close() {
    lookups.current++
    setScanning(false)
  }

  return (
    // The Scanner hands focus back here, since the row it opened from may have changed.
    <div ref={rowRef} tabIndex={-1} className="outline-none">
      {read ? (
        <div
          role="status"
          className="flex min-h-15 items-center gap-3 rounded-xl bg-dose-taken py-2 pr-1.5 pl-2"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-card text-dose-taken-foreground [&>svg]:size-5.5">
            <CheckIcon aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="leading-tight font-extrabold text-dose-taken-foreground">
              Barcode read
            </span>
            <span className="text-body-sm leading-snug text-secondary-foreground">
              Check these match your pack
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            className="shrink-0 text-dose-taken-foreground"
            onClick={() => setScanning(true)}
          >
            Scan again
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={disabled}
            aria-labelledby="medicine-scan-title"
            aria-describedby="medicine-scan-caption medicine-scan-help"
            onClick={() => setScanning(true)}
            className="flex min-h-15 w-full items-center gap-3 rounded-xl border bg-card py-2 pr-3.5 pl-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-accent text-accent-foreground [&>svg]:size-5.5">
              <ScanBarcode aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span id="medicine-scan-title" className="leading-tight font-extrabold">
                Scan the pack
              </span>
              <span
                id="medicine-scan-caption"
                className="text-body-sm leading-snug text-muted-foreground"
              >
                Fills in the name and strength
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="size-5.5 shrink-0 text-muted-foreground" />
          </button>
          <p id="medicine-scan-help" className="px-1 text-caption text-muted-foreground">
            Meddies uses the camera only to read the barcode. Nothing saves until you do.
          </p>
        </div>
      )}
      {scanning && <BarcodeScanner onRead={lookUp} onClose={close} finalFocus={rowRef} />}
    </div>
  )
}
