'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
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
import { useMedicineArchive, type MedicineArchiveAction } from './use-medicine-archive'

const copy = {
  archive: {
    description:
      'Moves to Archived medications and stops the schedule. Unsent reminders are cancelled. History and stock stay unchanged. You can restore it later.',
    rejected: 'Medication wasn’t archived.',
    pending: 'Archiving...',
    retry: 'Retry archive',
    submit: 'Archive medication',
  },
  restore: {
    description: 'Returns to Medications. Its schedule and reminders won’t restart.',
    rejected: 'Medication wasn’t restored.',
    pending: 'Restoring...',
    retry: 'Retry restore',
    submit: 'Restore medication',
  },
} satisfies Record<MedicineArchiveAction, unknown>

/** #327 archive (292·S5) and #328 restore (292·S8) confirmation. Dismissal discards; navigation
 * keeps the attempt. A confirmed save leaves the user on the same page, now the archived or the
 * restored detail.
 */
export function MedicineArchiveDrawer({
  medicine,
  open,
  onClose,
  onSaved,
  heading,
  action = 'archive',
}: {
  medicine: Medicine
  open: boolean
  onClose: () => void
  onSaved: () => void
  /** The page heading: after a confirmed save the trigger is gone. */
  heading: RefObject<HTMLHeadingElement | null>
  action?: MedicineArchiveAction
}) {
  const save = useMedicineArchive(medicine, open, onSaved, action)
  const text = copy[action]
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
        // Wait until the closing scrim releases focus. After a save the trigger is gone.
        const target =
          document.getElementById(`${action}-medicine-${medicine.id}`) ?? heading.current
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
              {action === 'archive' ? 'Archive' : 'Restore'} {medicine.label}?
            </DrawerTitle>
            <DrawerClose
              disabled={busy}
              render={<Button size="icon" variant="ghost" />}
              aria-label="Close"
            >
              <X aria-hidden="true" />
            </DrawerClose>
          </div>
          <DrawerDescription>{text.description}</DrawerDescription>
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
                      : text.rejected}
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
              ? text.pending
              : offline
                ? saveMessages.connectToSave
                : problem === 'unconfirmed'
                  ? text.retry
                  : text.submit}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={dismiss}>
          Cancel
        </Button>
      </DrawerContent>
    </Drawer>
  )
}
