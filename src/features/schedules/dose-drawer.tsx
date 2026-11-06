'use client'

import type { ReactNode, RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { MedicationTile } from '@/features/medicines/medication-tile'

// Every dismissal path (swipe, Close, backdrop, Escape) discards the draft through onClose and
// never saves. While a save is pending, all of them are refused; a refused swipe snaps back.
export function DoseDrawer({
  open,
  saving,
  triggerId,
  medicineId,
  title,
  description,
  finalFocus,
  onClose,
  children,
}: {
  open: boolean
  saving: boolean
  triggerId: string
  medicineId: string
  title: string
  description: string
  finalFocus?: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Drawer
      open={open}
      triggerId={triggerId}
      disablePointerDismissal={saving}
      onOpenChange={(next, eventDetails) => {
        if (next) return
        if (saving) {
          eventDetails.cancel()
          return
        }
        onClose()
      }}
    >
      <DrawerContent finalFocus={finalFocus}>
        <DrawerHeader className="flex-row items-center gap-3.5">
          <MedicationTile medicineId={medicineId} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.75 wrap-break-word">
            <DrawerTitle className="text-[1.4375rem] leading-[1.1]">{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </div>
          <DrawerClose
            disabled={saving}
            render={<Button variant="outline" size="icon" className="rounded-full border-border" />}
            aria-label="Close dose details"
          >
            <Icon name="close" size={14} />
          </DrawerClose>
        </DrawerHeader>
        {children}
      </DrawerContent>
    </Drawer>
  )
}
