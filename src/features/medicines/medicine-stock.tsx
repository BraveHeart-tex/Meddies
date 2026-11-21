'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Package, X } from 'lucide-react'
import { z } from 'zod'
import { QuantityStepper } from '@/components/quantity-stepper'
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
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import {
  parseQuantity,
  quantityProblem,
  stockCountProblem,
  stockLeft,
  unitName,
  type MedicineType,
} from '@/lib/quantity-policy'
import { saveMessages } from '@/lib/save-messages'
import { useKnownOffline } from '@/lib/use-known-offline'
import type { Medicine } from './contract'
import { MedicationInsetRow } from './medication-inset-list'
import { StockOptionsDrawer } from './stock-options-drawer'
import { drawerCopy, stockCopy } from './stock-copy'
import { useMedicineStock, type MedicineStockAction } from './use-medicine-stock'

export { stockCopy } from './stock-copy'

/** Inline unit grid feedback: counts allow zero; a Refill must be positive. */
export function stockCountSchema(unit: MedicineType, refill = false) {
  return z.object({
    count: z
      .string()
      .superRefine((value, context) => {
        // Required here: an empty count leaves stock off only in Add medicine.
        const problem = refill
          ? quantityProblem(value, unit)
          : value.trim()
            ? stockCountProblem(value, unit)
            : 'Enter a count.'
        if (problem) context.addIssue({ code: 'custom', message: problem })
      })
      .transform((value) => parseQuantity(value) as number),
  })
}
type StockCountValues = { count: string }
const stockCountDefaults: StockCountValues = { count: '' }

export const countOf = (medicine: Medicine) =>
  medicine.stock?.tracked ? medicine.stock.count : null

/** The Stock row's value (403 approval): "Not tracking" or the count, such as "120 ml left". */
export function stockRowValue(medicine: Medicine) {
  const count = countOf(medicine)
  return count === null ? stockCopy.off : stockLeft(count, medicine.unit)
}

type StockDrawerKind = MedicineStockAction | 'options'

/**
 * The Stock row on the Medication detail summary (238·A3), first in the inset group above Dose
 * history: the package tile and a quiet value, "Not tracking" or the server-confirmed count such as
 * "120 ml left"; a save in flight never shows a count. Off, the row opens the turn-on drawer; on,
 * the stock Drawer with Add a refill, Change the count and Stop tracking. Every stock drawer returns
 * focus to the row when it closes, after a confirmed change too. Days of stock left (#395) and the
 * low-stock warning (#52) join the past-count line under this row.
 */
export function MedicineStockRow({ medicine }: { medicine: Medicine }) {
  const [open, setOpen] = useState<StockDrawerKind | null>(null)
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])
  const row = useRef<HTMLAnchorElement & HTMLButtonElement>(null)
  const count = countOf(medicine)
  const close = useCallback(() => setOpen(null), [])
  // Moving from the stock Drawer to its confirm closes one drawer as the next opens; only the last
  // drawer to close hands focus back.
  const closed = useCallback(() => {
    if (openRef.current === null) row.current?.focus({ preventScroll: true })
  }, [])
  return (
    <>
      <MedicationInsetRow
        ref={row}
        icon={Package}
        label={stockCopy.heading}
        description={
          medicine.stock?.tracked && medicine.stock.intakePastCount
            ? stockCopy.pastCount
            : undefined
        }
        value={stockRowValue(medicine)}
        onClick={() => setOpen(count === null ? 'stockOn' : 'options')}
      />
      <StockCountDrawer
        action="stockOn"
        medicine={medicine}
        open={open === 'stockOn'}
        onClose={close}
        onClosed={closed}
      />
      <StockCountDrawer
        action="stockCorrection"
        medicine={medicine}
        open={open === 'stockCorrection'}
        onClose={close}
        onClosed={closed}
      />
      <StockCountDrawer
        action="stockRefill"
        medicine={medicine}
        open={open === 'stockRefill'}
        onClose={close}
        onClosed={closed}
      />
      <StockOptionsDrawer
        medicine={medicine}
        count={count}
        open={open === 'options' && count !== null}
        onClose={close}
        onClosed={closed}
        onRefill={() => setOpen('stockRefill')}
        onChangeCount={() => setOpen('stockCorrection')}
        onStop={() => setOpen('stockOff')}
      />
      <StockDrawer
        action="stockOff"
        medicine={medicine}
        open={open === 'stockOff'}
        onClose={close}
        onClosed={closed}
        title={stockCopy.confirmTitle(medicine.label)}
        description={stockCopy.confirmBody(medicine.label)}
      />
    </>
  )
}

/* The #392 count drawer shell: a starting/current count (zero allowed) or positive Refill amount
   in the Medicine's Quantity unit, empty on every open. The grid error sits under the control, above the help. */
function StockCountDrawer({
  action,
  medicine,
  open,
  onClose,
  onClosed,
}: {
  action: 'stockOn' | 'stockCorrection' | 'stockRefill'
  medicine: Medicine
  open: boolean
  onClose: () => void
  onClosed: () => void
}) {
  const form = useForm<StockCountValues, unknown, z.output<ReturnType<typeof stockCountSchema>>>({
    resolver: zodResolver(stockCountSchema(medicine.unit, action === 'stockRefill')),
    defaultValues: stockCountDefaults,
  })
  const { reset } = form
  useEffect(() => {
    if (open) reset(stockCountDefaults)
  }, [open, reset])
  const refill = action === 'stockRefill'
  const correction = action === 'stockCorrection'
  const id = refill
    ? `refill-amount-${medicine.id}`
    : correction
      ? `current-count-${medicine.id}`
      : `stock-count-${medicine.id}`
  const label = refill
    ? stockCopy.refillLabel
    : correction
      ? stockCopy.currentLabel
      : stockCopy.countLabel
  return (
    <StockDrawer
      action={action}
      medicine={medicine}
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      title={
        refill
          ? stockCopy.refillTitle(medicine.label)
          : correction
            ? stockCopy.changeTitle(medicine.label)
            : stockCopy.drawerTitle(medicine.label)
      }
      description={(refill ? stockCopy.refillBody : stockCopy.drawerBody)(
        unitName(null, medicine.unit),
      )}
      validate={(submit) => form.handleSubmit(({ count }) => submit(count))()}
    >
      {(busy) => (
        <Controller
          name="count"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={id}>{label}</FieldLabel>
              <div data-base-ui-swipe-ignore="y">
                <QuantityStepper
                  ref={field.ref}
                  id={id}
                  label={label}
                  unit={medicine.unit}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={busy}
                  grow
                  zero={!refill}
                  aria-invalid={fieldState.invalid}
                  aria-describedby={fieldState.invalid ? `${id}-error ${id}-help` : `${id}-help`}
                />
              </div>
              <FieldError id={`${id}-error`} errors={[fieldState.error]} />
              <FieldDescription id={`${id}-help`}>
                {refill
                  ? stockCopy.refillHelp
                  : correction
                    ? stockCopy.currentHelp
                    : stockCopy.countHelp}
              </FieldDescription>
            </Field>
          )}
        />
      )}
    </StockDrawer>
  )
}

/* The #392 turn-on and turn-off drawer shell, following the Archive confirm (292·S5): a saving label, offline,
   conflict and might-not-have-saved alerts above the primary, and dismissal refused while saving.
   Dismissal discards the attempt; navigation keeps it. */
function StockDrawer({
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
  description: string
  /** Validates the form, then calls `submit` with the starting count. */
  validate?: (submit: (count: number) => Promise<void>) => Promise<void>
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
            <DrawerDescription>{description}</DrawerDescription>
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
                  : problem === 'unconfirmed' ||
                      ((action === 'stockCorrection' || action === 'stockRefill') &&
                        problem === 'rejected')
                    ? text.retry
                    : text.submit}
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
