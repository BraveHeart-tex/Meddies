import Link from 'next/link'
import { auth, authConfigured } from '@/features/auth/server'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { medicines } from '@/features/medicines/server'
import { MedicineError, type Medicine } from '@/features/medicines/contract'
import { schedules } from '@/features/schedules/server'
import { isScheduleDate, istanbulDate, SCHEDULE_TIMEZONE } from '@/features/schedules/contract'
import type { DoseOccurrence } from '@/features/schedules/contract'
import { HistoryDoseActions } from '@/features/schedules/history-dose-actions'

function displayTime(instant: string, includeDate = false) {
  const options: Intl.DateTimeFormatOptions = includeDate
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { hour: 'numeric', minute: '2-digit' }
  return new Intl.DateTimeFormat('en', { timeZone: SCHEDULE_TIMEZONE, ...options }).format(
    new Date(instant),
  )
}

function quantityLabel(quantity: number, medicine?: Medicine) {
  return `${quantity} ${medicine?.unit ?? 'units'}`
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>
}) {
  const configured = authConfigured()
  const session = configured ? await auth() : null
  if (!configured || !session?.user?.id) {
    return (
      <main className="mx-auto max-w-lg space-y-4 px-6 py-12">
        <p>
          {configured ? 'Sign in to view dose history.' : 'Sign-in is temporarily unavailable.'}
        </p>
        <Link className="underline" href="/">
          Home
        </Link>
      </main>
    )
  }

  const query = await searchParams
  const today = istanbulDate(new Date())
  const date = typeof query.date === 'string' ? query.date : today
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
        error instanceof MedicineError && error.code === 'unauthorized'
          ? { status: 'unauthorized' }
          : { status: 'unavailable' }
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 px-6 py-12">
      <SessionBoundary expires={session.expires}>
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Dose history</h1>
          <Link className="text-sm underline" href="/">
            Back to Today
          </Link>
        </header>
        <form action="/history" method="get" className="flex items-end gap-3">
          <div className="flex-1 space-y-2">
            <label className="block text-sm font-medium" htmlFor="history-date">
              Choose a date
            </label>
            <input
              className="h-11 w-full rounded-md border px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              id="history-date"
              name="date"
              type="date"
              max={today}
              defaultValue={result.status === 'invalid' ? today : date}
              required
            />
          </div>
          <button
            className="h-11 rounded-md bg-primary px-4 text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            type="submit"
          >
            View
          </button>
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
          <ol aria-label={`Doses for ${date}`} className="divide-y rounded-md border">
            {result.doses.map((dose) => {
              const medicine = result.medicines.get(dose.medicineId)
              return (
                <li key={dose.id} className="space-y-1 p-4">
                  <p className="font-medium">
                    {medicine?.label ?? 'Medicine'} - {quantityLabel(dose.quantity, medicine)}
                  </p>
                  <p className="text-sm">
                    Scheduled <time dateTime={dose.dueAt}>{displayTime(dose.dueAt)}</time>
                  </p>
                  <HistoryDoseActions dose={dose} medicine={medicine} date={date} />
                </li>
              )
            })}
          </ol>
        )}
      </SessionBoundary>
    </main>
  )
}
