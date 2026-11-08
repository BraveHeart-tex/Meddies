'use client'

import { useEffect } from 'react'

/** Focus the resolved page heading, including client-loaded Medications query states. */
export function EntryFocus() {
  useEffect(() => {
    function focusHeading() {
      const heading = document.querySelector<HTMLElement>('main h1')
      if (!heading) return false
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
      return true
    }
    if (focusHeading()) return
    const observer = new MutationObserver(() => {
      if (focusHeading()) observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return null
}
