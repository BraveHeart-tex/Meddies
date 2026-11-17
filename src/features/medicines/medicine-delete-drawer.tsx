'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { saveMessages } from '@/lib/save-messages'
import { useKnownOffline } from '@/lib/use-known-offline'
import type { Medicine } from './contract'
import { useMedicineDelete } from './use-medicine-delete'

/** #329: explicit, irreversible confirmation. Dismissal discards; navigation keeps the attempt. */
export function MedicineDeleteDrawer({
  medicine,
  open,
  onClose,
  onDeleted,
}: {
  medicine: Medicine
  open: boolean
  onClose: () => void
  onDeleted: () => void
}) {
  const save = useMedicineDelete(medicine, open, onDeleted)
  // Base UI needs a closed mount before the requested open to apply its entrance styles.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize Base UI's first open after mounting closed
    setMounted(true)
  }, [])
  const offline = useKnownOffline()
  const title = useRef<HTMLHeadingElement>(null)
  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState(false)
  const busy = save.pending || reviewing
  const problem = save.problem
  function dismiss() {
    if (busy) return
    save.clear()
    setReviewError(false)
    onClose()
  }
  async function review() {
    setReviewing(true)
    setReviewError(false)
    try {
      await save.review()
      onClose()
    } catch {
      setReviewError(true)
    } finally {
      setReviewing(false)
    }
  }
  return (
    <Drawer
      open={mounted && open}
      onOpenChangeComplete={(next) => {
        if (next) return
        // Wait until the closing scrim releases focus. A confirmed deletion has no trigger.
        const target =
          document.getElementById(`delete-medicine-${medicine.id}`) ??
          (window.location.pathname === '/medications' && !window.location.search
            ? document.querySelector<HTMLElement>('main h1')
            : null)
        if (target) {
          if (target.tagName === 'H1') target.tabIndex = -1
          target.focus({ preventScroll: true })
        }
      }}
      disablePointerDismissal={busy}
      onOpenChange={(next, details) => {
        if (next) return
        if (busy) details.cancel()
        else dismiss()
      }}
    >
      <DrawerContent initialFocus={title} finalFocus={false}>
        <DrawerHeader>
          <div className="flex items-start justify-between gap-3">
            <DrawerTitle ref={title} tabIndex={-1} className="outline-none">
              Delete {medicine.label}?
            </DrawerTitle>
            <DrawerClose
              disabled={busy}
              render={<Button size="icon" variant="ghost" />}
              aria-label="Close"
            >
              <X aria-hidden="true" />
            </DrawerClose>
          </div>
          <DrawerDescription>
            This medication has never had a schedule or a dose. Deleting it cannot be undone.
          </DrawerDescription>
        </DrawerHeader>
        {(offline || problem || reviewError) && (
          <Alert variant={offline ? 'default' : 'destructive'}>
            <AlertTitle>
              {offline
                ? saveMessages.offline
                : reviewError
                  ? 'Saved details didn’t load'
                  : problem === 'unconfirmed'
                    ? saveMessages.mightNotHaveSaved
                    : problem === 'conflict'
                      ? 'This medication changed elsewhere.'
                      : 'Medication wasn’t deleted.'}
            </AlertTitle>
            <AlertDescription>
              {offline
                ? saveMessages.offlineFormDetails
                : problem === 'unconfirmed'
                  ? saveMessages.retrySameSave
                  : problem === 'conflict'
                    ? "Your changes weren't saved."
                    : 'Check your connection and try again.'}
            </AlertDescription>
          </Alert>
        )}
        {problem === 'conflict' ? (
          <Button size="drawer" disabled={busy || offline} onClick={() => void review()}>
            Review saved medication
          </Button>
        ) : (
          <Button
            size="drawer"
            variant="destructive"
            disabled={busy || offline}
            onClick={() => void save.submit()}
          >
            {save.pending
              ? 'Deleting...'
              : offline
                ? saveMessages.connectToSave
                : problem === 'unconfirmed'
                  ? 'Retry delete'
                  : 'Delete medication'}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={dismiss}>
          Cancel
        </Button>
      </DrawerContent>
    </Drawer>
  )
}
