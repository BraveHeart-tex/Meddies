import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/** Shared by the cold fallback and the day, in the same History section position. */
export function HistoryInvalidDateNotice() {
  return (
    <Alert>
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Nothing to show for that day.</AlertTitle>
      <AlertDescription>History shows dates up to today. Showing today instead.</AlertDescription>
    </Alert>
  )
}
