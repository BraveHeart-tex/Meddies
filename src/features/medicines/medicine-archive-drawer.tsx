'use client'

import { useRef, useState, type RefObject } from 'react'
import { Info, X } from 'lucide-react'
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
import { useMedicineArchive } from './use-medicine-archive'

/** #327: explicit archive confirmation. Dismissal discards; navigation keeps the attempt.
 * A confirmed archive leaves the user on the same page, now the archived detail.
 */
export function MedicineArchiveDrawer({
  medicine,
  open,
  onClose,
  onArchived,
  heading,
}: {
  medicine: Medicine
  open: boolean
  onClose: () => void
  onArchived: () => void
  /** The page heading: the archived detail has no trigger to return focus to. */
  heading: RefObject<HTMLHeadingElement | null>
}) {
  const save = useMedicineArchive(medicine, open, onArchived)
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
      open={open}
      onOpenChangeComplete={(next) => {
        if (next) return
        // Wait until the closing scrim releases focus. The archived detail has no trigger.
        const target = document.getElementById(`archive-medicine-${medicine.id}`) ?? heading.current
        target?.focus({ preventScroll: true })
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
              Archive {medicine.label}?
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
            {medicine.label} leaves your Medications list. You can restore it later.
          </DrawerDescription>
        </DrawerHeader>
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>
            The schedule stops when the archive saves. Unsent dose, food and refill reminders are
            cancelled. History stays. Stock is unchanged.
          </AlertDescription>
        </Alert>
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
                      : 'Medication wasn’t archived.'}
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
          <Button size="drawer" disabled={busy || offline} onClick={() => void save.submit()}>
            {save.pending
              ? 'Archiving...'
              : offline
                ? saveMessages.connectToSave
                : problem === 'unconfirmed'
                  ? 'Retry archive'
                  : 'Archive medication'}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={dismiss}>
          Cancel
        </Button>
      </DrawerContent>
    </Drawer>
  )
}
