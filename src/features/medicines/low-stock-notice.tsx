import { TriangleAlert } from 'lucide-react'
import { isArchived, type Medicine } from './contract'
import { thresholdValue } from './stock-copy'

/** Only the server's active low flag shows a notice; equality and unconfirmed edits show none. */
export function LowStockNotice({ medicine }: { medicine: Medicine }) {
  if (isArchived(medicine) || !medicine.stock?.tracked || !medicine.stock.low) return null
  const threshold = thresholdValue(medicine)
  if (threshold === null) return null
  return (
    <span className="flex items-start gap-1.5 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0">
      <TriangleAlert aria-hidden="true" />
      <span>Running low: fewer than {threshold} left.</span>
    </span>
  )
}
