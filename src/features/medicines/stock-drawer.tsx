'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
import { drawerCopy } from './stock-copy'
import { useMedicineStock, type MedicineStockAction } from './use-medicine-stock'

/* The #392 turn-on and turn-off drawer shell, following the Archive confirm (292·S5): a saving label, offline,
   conflict and might-not-have-saved alerts above the primary, and dismissal refused while saving.
   Dismissal discards the attempt; navigation keeps it. */
export function StockDrawer({
  action,
  medicine,
  open,
  onClose,
  onClosed,
  title,
  description,
  validate,
  children,
}: {
  action: MedicineStockAction
  medicine: Medicine
  open: boolean
  onClose: () => void
  /** After the closing scrim releases focus, so focus can return to the Stock row. */
  onClosed: () => void
  title: string
  description?: string
  /** Validates the form, then calls `submit` with the starting count. */
  validate?: (submit: (count: number | null) => Promise<void>) => Promise<void>
  children?: (busy: boolean) => ReactNode
}) {
  const save = useMedicineStock(medicine, action, open, onClose)
  const text = drawerCopy[action]
  // Base UI needs a closed mount before the requested open to apply its entrance styles.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize Base UI's first open after mounting closed
    setMounted(true)
  }, [])
  const offline = useKnownOffline()
  const titleRef = useRef<HTMLHeadingElement>(null)
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
  function submit() {
    if (busy || offline) return
    if (validate) void validate((count) => save.submit(count))
    else void save.submit()
  }
  return (
    <Drawer
      open={mounted && open}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed()
      }}
      disablePointerDismissal={busy}
      onOpenChange={(next, details) => {
        if (next) return
        if (busy) details.cancel()
        else dismiss()
      }}
    >
      <DrawerContent initialFocus={titleRef} finalFocus={false}>
        <form
          noValidate
          aria-busy={busy}
          className="flex flex-col gap-4.5"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <DrawerHeader>
            <div className="flex items-start justify-between gap-3">
              <DrawerTitle ref={titleRef} tabIndex={-1} className="outline-none">
                {title}
              </DrawerTitle>
              <DrawerClose
                disabled={busy}
                render={<Button type="button" size="icon" variant="ghost" />}
                aria-label="Close"
              >
                <X aria-hidden="true" />
              </DrawerClose>
            </div>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          {children?.(busy)}
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
            <Button
              type="button"
              size="drawer"
              disabled={busy || offline}
              onClick={() => void review()}
            >
              Review saved medication
            </Button>
          ) : (
            <Button type="submit" size="drawer" disabled={busy || offline}>
              {save.pending
                ? text.pending
                : offline
                  ? saveMessages.connectToSave
                  : !save.turningOffAlert &&
                      (problem === 'unconfirmed' ||
                        ((action === 'stockCorrection' ||
                          action === 'stockRefill' ||
                          action === 'stockThreshold') &&
                          problem === 'rejected'))
                    ? text.retry
                    : text.submit}
            </Button>
          )}
          {action === 'stockThreshold' &&
            medicine.stock?.threshold !== undefined &&
            problem !== 'conflict' && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy || offline}
                onClick={() => void save.submit(null)}
              >
                {save.turningOffAlert && problem ? 'Try turning off alert again' : 'Turn off alert'}
              </Button>
            )}
          <Button type="button" variant="ghost" disabled={busy} onClick={dismiss}>
            Cancel
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
