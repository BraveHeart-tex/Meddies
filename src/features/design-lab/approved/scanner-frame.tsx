'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { BarcodeScanner } from '@/features/medicines/barcode-scanner'

/** Holds the Scanner's caller state, which #198 moves to the add medicine drawer. */
export function ScannerFrame() {
  const [open, setOpen] = useState(true)
  const [value, setValue] = useState<string | null>(null)
  if (open)
    return (
      <BarcodeScanner
        onRead={(read) => {
          setValue(read)
          setOpen(false)
        }}
        onClose={() => {
          setValue(null)
          setOpen(false)
        }}
      />
    )
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 px-5 text-center">
      <p className="text-heading font-extrabold">{value ?? 'Scanner closed'}</p>
      <Button onClick={() => setOpen(true)}>Open scanner</Button>
    </main>
  )
}
