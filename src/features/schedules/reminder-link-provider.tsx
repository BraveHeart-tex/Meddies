'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from 'react'
import { reminderLinkParam } from './reminder-link'

type ReminderLinkState = { occurrence: string | null; consume: () => void }

const ReminderLink = createContext<ReminderLinkState>({ occurrence: null, consume: () => {} })

/**
 * Holds the Occurrence a server-verified Reminder link names until its row's dose drawer opens.
 * Consuming clears the parameter with `history.replaceState`, not a router navigation, so Back
 * and reload never reopen the drawer and no server request runs (#367).
 */
export function ReminderLinkProvider({
  occurrence,
  children,
}: {
  occurrence: string | null
  children: ReactNode
}) {
  const [pending, setPending] = useState(occurrence)
  // A later link on the same mounted screen opens its own dose.
  const [linked, setLinked] = useState(occurrence)
  if (linked !== occurrence) {
    setLinked(occurrence)
    setPending(occurrence)
  }
  const consume = useCallback(() => {
    setPending(null)
    const url = new URL(window.location.href)
    url.searchParams.delete(reminderLinkParam)
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  }, [])
  return (
    <ReminderLink.Provider value={{ occurrence: pending, consume }}>
      {children}
    </ReminderLink.Provider>
  )
}

/**
 * Runs `open` once, after the dose's row has mounted with its data, when the Reminder link names
 * this dose.
 */
export function useReminderLinkOpen(doseId: string, open: () => void) {
  const { occurrence, consume } = useContext(ReminderLink)
  const linked = occurrence === doseId
  const openLinked = useEffectEvent(() => {
    consume()
    open()
  })
  useEffect(() => {
    if (linked) openLinked()
  }, [linked])
}
