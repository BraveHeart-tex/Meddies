'use client'

import { Dialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'

export function DoseSheet({
  open,
  triggerId,
  title,
  onClose,
  children,
}: {
  open: boolean
  triggerId: string
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Dialog.Root
      open={open}
      triggerId={triggerId}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-sheet-scrim" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-4xl border bg-background p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-sheet sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(100%-2rem,32rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <Dialog.Title className="min-w-0 [overflow-wrap:anywhere] text-2xl font-extrabold">
              {title}
            </Dialog.Title>
            <Dialog.Close
              className="min-h-11 min-w-11 rounded-lg border border-input bg-card px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label="Close dose details"
            >
              Close
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
