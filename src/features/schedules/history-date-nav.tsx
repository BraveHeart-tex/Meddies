'use client'

import { useEffect, useState, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { shiftDate } from '@/lib/calendar-date'

export const historyHref = (date: string) => `/history?date=${date}`

/** The current History day's focus target: its heading, or the alert or empty message. */
export const dayHeadingId = 'history-day-heading'

// Set by a date change here and consumed by the next History day that mounts, so focus moves to
// its heading after navigation but not on a direct load or reload (FE-648 a11y).
let focusRequested = false

/** Focuses `target` when it mounts after a History date change. */
export function useHistoryDayFocus(target: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!focusRequested) return
    focusRequested = false
    target.current?.focus()
  }, [target])
}

// Resolved when read, so it always names the day on screen.
const currentDayHeading: RefObject<HTMLElement | null> = {
  get current() {
    return document.getElementById(dayHeadingId)
  },
}

/**
 * History's date bar (D11): Previous day, the DatePicker and Next day. Every change pushes
 * `/history?date=`, so Back returns to the date seen before and reload keeps the current one.
 */
export function HistoryDateNav({ date, today }: { date: string; today: string }) {
  const router = useRouter()
  // After a pick, the closing calendar restores focus to the day heading instead of its
  // trigger. It does so after its exit animation, when the new day may already have mounted, so
  // the target is looked up then. Escape still returns focus to the trigger.
  const [picked, setPicked] = useState(false)
  const [value, setValue] = useState(date)
  const [shown, setShown] = useState(date)
  // A new date from the server (Back, Forward) replaces the picked one.
  if (shown !== date) {
    setShown(date)
    setValue(date)
  }
  function go(next: string) {
    if (next === value || next > today) return
    setValue(next)
    focusRequested = true
    router.push(historyHref(next))
  }
  return (
    <nav aria-label="History date" className="flex min-w-0 items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Previous day"
        onClick={() => go(shiftDate(value, -1))}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      {/* Portal clicks bubble here too, so a day click resets before onValueChange sets it. */}
      <div className="min-w-0 flex-1" onClickCapture={() => setPicked(false)}>
        <DatePicker
          id="history-date"
          label="Choose a date"
          today={today}
          max={today}
          value={value}
          onValueChange={(next) => {
            setPicked(next !== value)
            go(next)
          }}
          finalFocus={picked ? currentDayHeading : true}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Next day"
        disabled={value >= today}
        onClick={() => go(shiftDate(value, 1))}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  )
}
