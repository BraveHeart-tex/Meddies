'use client'

import { useRef, type ReactNode, type RefObject } from 'react'
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
  // The title takes focus on open, so nothing is chosen for her (FE-648 R1).
  const titleRef = useRef<HTMLHeadingElement>(null)
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
      <DrawerContent initialFocus={titleRef} finalFocus={finalFocus}>
        <DrawerHeader className="flex-row items-center gap-3.5">
          <MedicationTile medicineId={medicineId} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.75 wrap-break-word">
            <DrawerTitle
              ref={titleRef}
              tabIndex={-1}
              className="text-[1.4375rem] leading-[1.1] outline-none"
            >
              {title}
            </DrawerTitle>
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
