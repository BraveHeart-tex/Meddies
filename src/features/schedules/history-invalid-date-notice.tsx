import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Icon } from '@/components/ui/icon'

/** Shared by the cold fallback and the day, in the same History section position. */
export function HistoryInvalidDateNotice() {
  return (
    <Alert>
      <Icon name="warning" size={16} />
      <AlertTitle>Nothing to show for that day.</AlertTitle>
      <AlertDescription>History shows dates up to today. Showing today instead.</AlertDescription>
    </Alert>
  )
}
