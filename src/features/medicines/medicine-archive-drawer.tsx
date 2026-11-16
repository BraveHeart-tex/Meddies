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
import { useMedicineArchive, type MedicineArchiveAction } from './use-medicine-archive'

const copy = {
  archive: {
    description: (label: string) =>
      `${label} leaves your Medications list. You can restore it later.`,
    notice:
      'The schedule stops when the archive saves. Unsent dose, food and refill reminders are cancelled. History stays. Stock is unchanged.',
    rejected: 'Medication wasn’t archived.',
    pending: 'Archiving...',
    retry: 'Retry archive',
    submit: 'Archive medication',
  },
  restore: {
    description: (label: string) => `${label} returns to your Medications list.`,
    notice: 'No schedule or reminders restart. Set a schedule separately when you’re ready.',
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
          <DrawerDescription>{text.description(medicine.label)}</DrawerDescription>
        </DrawerHeader>
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>{text.notice}</AlertDescription>
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
