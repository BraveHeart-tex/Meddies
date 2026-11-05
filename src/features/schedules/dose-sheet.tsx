'use client'

import type { ReactNode, RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { MedicationTile } from '@/features/medicines/medication-tile'

export function DoseSheet({
  open,
  triggerId,
  medicineId,
  title,
  description,
  finalFocus,
  onClose,
  children,
}: {
  open: boolean
  triggerId: string
  medicineId: string
  title: string
  description: string
  finalFocus?: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Sheet
      open={open}
      triggerId={triggerId}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <SheetContent side="bottom" showCloseButton={false} finalFocus={finalFocus}>
        <SheetHeader className="flex-row items-center gap-3.5 p-0">
          <MedicationTile medicineId={medicineId} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.75 [overflow-wrap:break-word]">
            <SheetTitle className="text-[1.4375rem] leading-[1.1] font-extrabold">
              {title}
            </SheetTitle>
            <SheetDescription className="text-body-sm font-semibold">
              {description}
            </SheetDescription>
          </div>
          <SheetClose
            render={<Button variant="outline" size="icon" className="rounded-full border-border" />}
            aria-label="Close dose details"
          >
            <Icon name="close" size={14} />
          </SheetClose>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}
