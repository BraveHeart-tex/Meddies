import Link from 'next/link'
import { auth, authConfigured } from '@/features/auth/server'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { medicines } from '@/features/medicines/server'
import { type Medicine } from '@/features/medicines/contract'
import { ApplicationError } from '@/lib/application-error'
import { schedules, schedulingNow } from '@/features/schedules/server'
import { isScheduleDate, istanbulDate } from '@/features/schedules/contract'
import type { DoseOccurrence } from '@/features/schedules/contract'
import { formatHistoryTime } from '@/features/schedules/format-history-time'
import { HistoryDateField } from '@/features/schedules/history-date-field'
import { HistoryDoseActions } from '@/features/schedules/history-dose-actions'
import { SchedulingClockProvider } from '@/features/schedules/scheduling-clock'
import { Button } from '@/components/ui/button'
import { AppShell } from '@/components/layout/app-shell'
import { AppHeader } from '@/components/layout/app-header'

function quantityLabel(quantity: number, medicine?: Medicine) {
  return `${quantity} ${medicine?.unit ?? 'units'}`
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>
}) {
  const query = await searchParams
  const now = schedulingNow()
  const today = istanbulDate(now)
  const requestedDate = typeof query.date === 'string' ? query.date : today
  const returnDate =
    typeof query.date === 'string' && isScheduleDate(query.date) && query.date <= today
      ? query.date
      : ''
  const configured = authConfigured()
  const session = configured ? await auth() : null
  if (!configured || !session?.user?.id) {
    return (
      <main className="mx-auto max-w-lg space-y-4 px-6 py-12">
        <p>
          {configured ? 'Sign in to view dose history.' : 'Sign-in is temporarily unavailable.'}
        </p>
        <Link
          className="underline"
          href={`/?returnTo=${encodeURIComponent(returnDate ? `/history?date=${returnDate}` : '/history')}`}
        >
          Sign in
        </Link>
      </main>
    )
  }

  const date = requestedDate
  const validDate = typeof query.date !== 'object' && isScheduleDate(date) && date <= today
  let result:
    | { status: 'loaded'; doses: DoseOccurrence[]; medicines: Map<string, Medicine> }
    | { status: 'unavailable' }
    | { status: 'unauthorized' }
    | { status: 'invalid' } = validDate ? { status: 'unavailable' } : { status: 'invalid' }

  if (validDate) {
    try {
      const [doses, medicineList] = await Promise.all([schedules.history(date), medicines.list()])
      result = {
        status: 'loaded',
        doses,
        medicines: new Map(medicineList.map((medicine) => [medicine.id, medicine])),
      }
    } catch (error) {
      result =
        error instanceof ApplicationError && error.code === 'unauthorized'
          ? { status: 'unauthorized' }
          : { status: 'unavailable' }
    }
  }

  return (
    <SessionBoundary ownerId={session.user.id} expires={session.expires}>
      <SchedulingClockProvider serverNow={now.toISOString()}>
        <AppShell>
          <div className="space-y-2">
            <AppHeader title="Dose history" />
            <Link className="text-sm underline" href="/">
              Back to Today
            </Link>
          </div>
          <form action="/history" method="get" className="flex min-w-0 items-end gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <label className="block text-sm font-medium" htmlFor="history-date">
                Choose a date
              </label>
              <HistoryDateField
                key={result.status === 'invalid' ? today : date}
                defaultValue={result.status === 'invalid' ? today : date}
                today={today}
              />
            </div>
            <Button type="submit">View</Button>
          </form>
          {result.status === 'invalid' ? (
            <p role="alert">Choose a valid date up to today.</p>
          ) : result.status === 'unauthorized' ? (
            <p role="alert">
              Your session ended.{' '}
              <Link className="underline" href="/">
                Sign in again
              </Link>{' '}
              to view history.
            </p>
          ) : result.status === 'unavailable' ? (
            <div role="alert" className="space-y-2">
              <p>Dose history is temporarily unavailable.</p>
              <a className="underline" href={`/history?date=${encodeURIComponent(date)}`}>
                Retry this date
              </a>
            </div>
          ) : result.doses.length === 0 ? (
            <p>No past doses for this date.</p>
          ) : (
            <ol aria-label={`Doses for ${date}`} className="space-y-2.5">
              {result.doses.map((dose) => {
                const medicine = result.medicines.get(dose.medicineId)
                return (
                  <li
                    key={dose.id}
                    className="space-y-2 rounded-2xl border bg-card p-4 [overflow-wrap:anywhere]"
                  >
                    <p className="font-medium">
                      {medicine?.label ?? 'Medicine'} - {quantityLabel(dose.quantity, medicine)}
                    </p>
                    <p className="text-sm">
                      Scheduled <time dateTime={dose.dueAt}>{formatHistoryTime(dose.dueAt)}</time>
                    </p>
                    <HistoryDoseActions dose={dose} medicine={medicine} date={date} />
                  </li>
                )
              })}
            </ol>
          )}
        </AppShell>
      </SchedulingClockProvider>
    </SessionBoundary>
  )
}
