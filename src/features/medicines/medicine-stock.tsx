'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Package } from 'lucide-react'
import { z } from 'zod'
import { QuantityStepper } from '@/components/quantity-stepper'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  formatQuantity,
  parseQuantity,
  quantityProblem,
  stockCountProblem,
  stockLeft,
  unitName,
  type MedicineType,
} from '@/lib/quantity-policy'
import type { Medicine } from './contract'
import { MedicationInsetRow } from './medication-inset-list'
import { StockOptionsDrawer } from './stock-options-drawer'
import { LowStockNotice } from './low-stock-notice'
import { stockCopy } from './stock-copy'
import type { MedicineStockAction } from './use-medicine-stock'
import { StockDrawer } from './stock-drawer'

export { stockCopy } from './stock-copy'

/** Inline unit grid feedback: counts allow zero; a Refill or Low-stock threshold must be positive. */
export function stockCountSchema(unit: MedicineType, positive = false) {
  return z.object({
    count: z
      .string()
      .superRefine((value, context) => {
        // Required here: an empty count leaves stock off only in Add medicine.
        const problem = positive
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
 * the stock Drawer with Add a refill, Change the count, Low-stock alert and Stop tracking. Every stock drawer returns
 * focus to the row when it closes, after a confirmed change too. The low-stock warning (#52)
 * precedes the past-count line under this row.
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
          medicine.stock?.tracked && (medicine.stock.low || medicine.stock.intakePastCount) ? (
            <>
              <LowStockNotice medicine={medicine} />{' '}
              {medicine.stock.intakePastCount && (
                <span className="block">{stockCopy.pastCount}</span>
              )}
            </>
          ) : undefined
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
      <StockCountDrawer
        action="stockThreshold"
        medicine={medicine}
        open={open === 'stockThreshold'}
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
        onAlert={() => setOpen('stockThreshold')}
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

/* The #392 count drawer shell: a starting/current count (zero allowed), positive Refill or
   Low-stock threshold in the Medicine's Quantity unit. Counts and Refills open empty; the alert
   starts with the saved threshold or empty while off. Grid errors sit above the help. */
function StockCountDrawer({
  action,
  medicine,
  open,
  onClose,
  onClosed,
}: {
  action: 'stockOn' | 'stockCorrection' | 'stockRefill' | 'stockThreshold'
  medicine: Medicine
  open: boolean
  onClose: () => void
  onClosed: () => void
}) {
  const form = useForm<StockCountValues, unknown, z.output<ReturnType<typeof stockCountSchema>>>({
    resolver: zodResolver(
      stockCountSchema(medicine.unit, action === 'stockRefill' || action === 'stockThreshold'),
    ),
    defaultValues: stockCountDefaults,
  })
  const { reset } = form
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current)
      reset({
        count:
          action === 'stockThreshold' && medicine.stock?.threshold !== undefined
            ? formatQuantity(medicine.stock.threshold, medicine.unit)
            : '',
      })
    wasOpen.current = open
  }, [open, reset, action, medicine.stock?.threshold, medicine.unit])
  const threshold = action === 'stockThreshold'
  const refill = action === 'stockRefill'
  const correction = action === 'stockCorrection'
  const id = threshold
    ? `stock-threshold-${medicine.id}`
    : refill
      ? `refill-amount-${medicine.id}`
      : correction
        ? `current-count-${medicine.id}`
        : `stock-count-${medicine.id}`
  const label = threshold
    ? stockCopy.alertLabel
    : refill
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
        threshold
          ? stockCopy.alertTitle(medicine.label)
          : refill
            ? stockCopy.refillTitle(medicine.label)
            : correction
              ? stockCopy.changeTitle(medicine.label)
              : stockCopy.drawerTitle(medicine.label)
      }
      description={
        threshold
          ? undefined
          : (refill ? stockCopy.refillBody : stockCopy.drawerBody)(unitName(null, medicine.unit))
      }
      validate={(submit) => form.handleSubmit(({ count }) => submit(count))()}
    >
      {(busy) => (
        <Controller
          name="count"
          control={form.control}
          render={({ field, fieldState }) => (
            <FieldGroup>
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
                    zero={!refill && !threshold}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.invalid ? `${id}-error ${id}-help` : `${id}-help`}
                  />
                </div>
                <FieldError id={`${id}-error`} errors={[fieldState.error]} />
                <FieldDescription id={`${id}-help`}>
                  {threshold
                    ? stockCopy.alertHelp
                    : refill
                      ? stockCopy.refillHelp
                      : correction
                        ? stockCopy.currentHelp
                        : stockCopy.countHelp}
                </FieldDescription>
              </Field>
            </FieldGroup>
          )}
        />
      )}
    </StockDrawer>
  )
}
