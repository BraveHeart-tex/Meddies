import { Item, ItemContent } from '@/components/ui/item'
import { formatQuantity, unitName, type MedicineType } from '@/lib/quantity-policy'
import type { Medicine } from './contract'
import { countOf, stockCopy } from './medicine-stock'

/* Archived medication detail's read-only count (#392 Stock card): the server-confirmed count in
   display type with its unit beside it. */
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
 * The Stock section on Archived medication detail: the count with no actions, and nothing while
 * stock is off (#392).
 */
export function MedicineStockCard({ medicine }: { medicine: Medicine }) {
  const count = countOf(medicine)
  if (count === null) return null
  return (
    <section aria-labelledby={`stock-heading-${medicine.id}`} className="flex flex-col gap-3">
      <h2 id={`stock-heading-${medicine.id}`} className="text-heading">
        {stockCopy.heading}
      </h2>
      <StockCountCard count={count} unit={medicine.unit} />
    </section>
  )
}
