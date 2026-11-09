'use client'

import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { discardSessionFormDraft } from '@/lib/session-drafts'
import { sessionSaves } from '@/lib/session-saves'
import { useSessionSavePending } from '@/lib/use-session-save'
import type { Medicine } from './contract'
import { MedicineForm } from './medicine-form'
import { medicineAddKey } from './medicine-form-schema'
import { showMedicationsView } from './medications-nav'
import { medicationsHref } from './routes'

/**
 * Add medicine over the Medications list (`B·Drawer`). Swipe, Close, backdrop and Escape are its
 * Clear form: they discard the draft and any failed save, and are refused while saving; a refused
 * swipe snaps back. Back and other navigation close it through `open` and keep the draft.
 */
export function MedicineAddDrawer({
  open,
  returnFocus,
  onSaved,
}: {
  open: boolean
  /** Whether closing returns focus to Add. The saved medicine's page takes focus itself. */
  returnFocus: boolean
  onSaved: (medicine: Medicine) => void
}) {
  const client = useQueryClient()
  const saving = useSessionSavePending(medicineAddKey)
  const titleRef = useRef<HTMLHeadingElement>(null)
  return (
    <Drawer
      open={open}
      disablePointerDismissal={saving}
      onOpenChange={(next, eventDetails) => {
        if (next) return
        if (saving) {
          eventDetails.cancel()
          return
        }
        sessionSaves(client).clear(medicineAddKey)
        discardSessionFormDraft(client, medicineAddKey)
        showMedicationsView(medicationsHref({ mode: 'list' }), 'replace', { keepScroll: true })
      }}
    >
      {/* The title takes focus on open, so the keyboard stays down until she picks a row. */}
      <DrawerContent initialFocus={titleRef} finalFocus={returnFocus}>
        <div className="-mt-2 flex flex-col gap-3.5">
          <DrawerHeader className="-mx-2 -my-1 grid min-h-12 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-0 text-center">
            <DrawerClose
              disabled={saving}
              render={<Button variant="ghost" size="icon" className="rounded-full" />}
              aria-label="Close"
            >
              <X aria-hidden="true" data-icon="inline-start" />
            </DrawerClose>
            <DrawerTitle ref={titleRef} tabIndex={-1} className="text-heading outline-none">
              Add medication
            </DrawerTitle>
          </DrawerHeader>
          <MedicineForm onSaved={onSaved} />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
