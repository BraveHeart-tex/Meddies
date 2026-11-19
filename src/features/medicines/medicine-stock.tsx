'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import {
  formatQuantity,
  parseQuantity,
  stockCountProblem,
  unitName,
  type MedicineType,
} from '@/lib/quantity-policy'
import { saveMessages } from '@/lib/save-messages'
import { useKnownOffline } from '@/lib/use-known-offline'
import type { Medicine } from './contract'
import { useMedicineStock, type MedicineStockAction } from './use-medicine-stock'

export const stockCopy = {
  heading: 'Stock',
  track: 'Track stock',
  offTitle: 'Not tracking stock',
  offBody: (plural: string) => `Add how many ${plural} you have to see the count here.`,
  stop: 'Stop tracking',
  drawerTitle: (label: string) => `Track ${label} stock`,
  drawerBody: (plural: string) => `How many ${plural} do you have now?`,
  countLabel: 'Starting count',
  countHelp: 'Shows on this page and in Medications.',
  confirmTitle: (label: string) => `Stop tracking ${label} stock?`,
  confirmBody: (label: string) =>
    `Meddies stops counting ${label}. To track again, you’ll enter a fresh count.`,
}

const drawerCopy = {
  stockOn: {
    rejected: 'Count wasn’t saved.',
    pending: 'Saving count...',
    retry: 'Try saving count again',
    submit: 'Start tracking',
  },
  stockOff: {
    rejected: 'Stock tracking didn’t stop.',
    pending: 'Stopping...',
    retry: 'Retry stop',
    submit: stockCopy.stop,
  },
} satisfies Record<MedicineStockAction, unknown>

/** Client mirror of `isStockCount` for inline feedback: the unit's grid, zero allowed. */
export function stockCountSchema(unit: MedicineType) {
  return z.object({
    count: z
      .string()
      .superRefine((value, context) => {
        // Required here: an empty count leaves stock off only in Add medicine.
        const problem = value.trim() ? stockCountProblem(value, unit) : 'Enter a count.'
        if (problem) context.addIssue({ code: 'custom', message: problem })
      })
      .transform((value) => parseQuantity(value) as number),
  })
}
type StockCountValues = { count: string }
const stockCountDefaults: StockCountValues = { count: '' }

const countOf = (medicine: Medicine) => (medicine.stock?.tracked ? medicine.stock.count : null)

/* The #392 Stock card on: the server-confirmed count in display type with its unit beside it. The low-stock
   notice (#52) joins this card under the count. */
function StockCountCard({ count, unit }: { count: number; unit: MedicineType }) {
  return (
    <Item variant="card">
      <ItemContent>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-display font-extrabold tabular-nums">
            {formatQuantity(count, unit)}
          </span>
          <span className="text-body-lg font-bold text-muted-foreground">
            {unitName(count, unit)} left
          </span>
        </p>
      </ItemContent>
    </Item>
  )
}

/**
 * The Stock section on Medication detail (#392 Stock card, in 238·A3), under Log a dose. Off, one
 * card says stock is not tracked and Track stock opens the turn-on drawer. On, the card shows the
 * server-confirmed count and a quiet Stop tracking opens the turn-off confirm; nothing shows
 * optimistically. `readOnly` is Archived medication detail: the count without actions, and nothing
 * while stock is off. Record a refill (#48) and Change the count (#49) join as a row of buttons
 * under the card.
 */
export function MedicineStock({
  medicine,
  readOnly = false,
}: {
  medicine: Medicine
  readOnly?: boolean
}) {
  const [open, setOpen] = useState<MedicineStockAction | null>(null)
  const count = countOf(medicine)
  if (readOnly && count === null) return null
  const close = () => setOpen(null)
  return (
    <section aria-labelledby={`stock-heading-${medicine.id}`} className="flex flex-col gap-3">
      <h2 id={`stock-heading-${medicine.id}`} className="text-heading">
        {stockCopy.heading}
      </h2>
      {count === null ? (
        <Item variant="card" className="flex-col items-stretch gap-3.5">
          <ItemContent>
            <ItemTitle>{stockCopy.offTitle}</ItemTitle>
            <ItemDescription>{stockCopy.offBody(unitName(null, medicine.unit))}</ItemDescription>
          </ItemContent>
          <Button
            id={`stockOn-${medicine.id}`}
            variant="outline"
            className="w-full"
            aria-haspopup="dialog"
            aria-expanded={open === 'stockOn'}
            onClick={() => setOpen('stockOn')}
          >
            <Package aria-hidden="true" data-icon="inline-start" />
            {stockCopy.track}
          </Button>
        </Item>
      ) : (
        <>
          <StockCountCard count={count} unit={medicine.unit} />
          {!readOnly && (
            <Button
              id={`stockOff-${medicine.id}`}
              variant="ghost"
              aria-haspopup="dialog"
              aria-expanded={open === 'stockOff'}
              onClick={() => setOpen('stockOff')}
            >
              {stockCopy.stop}
            </Button>
          )}
        </>
      )}
      {!readOnly && (
        <>
          <StockOnDrawer medicine={medicine} open={open === 'stockOn'} onClose={close} />
          <StockDrawer
            action="stockOff"
            medicine={medicine}
            open={open === 'stockOff'}
            onClose={close}
            title={stockCopy.confirmTitle(medicine.label)}
            description={stockCopy.confirmBody(medicine.label)}
          />
        </>
      )}
    </section>
  )
}

/* The #392 turn-on drawer: the starting count in the Medicine's dose unit, typing allowed, zero allowed, empty on
   every open. The grid error sits under the control, above the help. */
function StockOnDrawer({
  medicine,
  open,
  onClose,
}: {
  medicine: Medicine
  open: boolean
  onClose: () => void
}) {
  const form = useForm<StockCountValues, unknown, z.output<ReturnType<typeof stockCountSchema>>>({
    resolver: zodResolver(stockCountSchema(medicine.unit)),
    defaultValues: stockCountDefaults,
  })
  const { reset } = form
  useEffect(() => {
    if (open) reset(stockCountDefaults)
  }, [open, reset])
  const id = `stock-count-${medicine.id}`
  return (
    <StockDrawer
      action="stockOn"
      medicine={medicine}
      open={open}
      onClose={onClose}
      title={stockCopy.drawerTitle(medicine.label)}
      description={stockCopy.drawerBody(unitName(null, medicine.unit))}
      validate={(submit) => form.handleSubmit(({ count }) => submit(count))()}
    >
      {(busy) => (
        <Controller
          name="count"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={id}>{stockCopy.countLabel}</FieldLabel>
              <div data-base-ui-swipe-ignore="y">
                <QuantityStepper
                  ref={field.ref}
                  id={id}
                  label={stockCopy.countLabel}
                  unit={medicine.unit}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={busy}
                  grow
                  zero
                  aria-invalid={fieldState.invalid}
                  aria-describedby={fieldState.invalid ? `${id}-error ${id}-help` : `${id}-help`}
                />
              </div>
              <FieldError id={`${id}-error`} errors={[fieldState.error]} />
              <FieldDescription id={`${id}-help`}>{stockCopy.countHelp}</FieldDescription>
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
  title,
  description,
  validate,
  children,
}: {
  action: MedicineStockAction
  medicine: Medicine
  open: boolean
  onClose: () => void
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
        if (next) return
        // Wait until the closing scrim releases focus. After a save the other trigger shows.
        const target =
          document.getElementById(`stockOn-${medicine.id}`) ??
          document.getElementById(`stockOff-${medicine.id}`)
        target?.focus({ preventScroll: true })
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
                  : problem === 'unconfirmed'
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
