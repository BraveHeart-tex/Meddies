'use client'

import { createContext, useContext, useLayoutEffect, type ComponentProps } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { parseMedicationsView } from './routes'

/** The view in the URL. Native History changes reach it without a server round trip (FE-625). */
export function useMedicationsView() {
  return parseMedicationsView(useSearchParams())
}

// Set by a view change here and consumed once the new view renders, so Back and Forward keep the
// browser's own scroll restoration.
let scrollRequested = false

/**
 * Changes the `/medications` view with the native History API, as History does for dates: the
 * view reads the Query cache and the panel, its handoffs and its session drafts stay mounted.
 */
export function showMedicationsView(
  href: string,
  method: 'push' | 'replace' = 'push',
  { keepScroll = false }: { keepScroll?: boolean } = {},
) {
  const { pathname, search, hash } = window.location
  if (`${pathname}${search}${hash}` === href) {
    window.scrollTo(0, 0)
    return
  }
  // The Add drawer opens and closes over the list without moving it.
  scrollRequested = !keepScroll
  if (method === 'push') window.history.pushState(null, '', href)
  else window.history.replaceState(null, '', href)
}

/** After a view change, does what a link would: scroll to its fragment, else to the top. */
export function useMedicationsViewScroll(viewKey: string) {
  useLayoutEffect(() => {
    if (!scrollRequested) return
    scrollRequested = false
    const target = window.location.hash && document.getElementById(window.location.hash.slice(1))
    if (target) target.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [viewKey])
}

/**
 * True inside a fallback shown while a router navigation is still arriving. A native URL change
 * there could be overwritten when the page lands, so links navigate through the router instead.
 */
export const PendingRouteContext = createContext(false)

/** A real link to a Medications view. Plain clicks change the view without a server round trip. */
export function MedicationsLink({
  href,
  onShow,
  routerNavigation = false,
  keepScroll = false,
  ...props
}: Omit<ComponentProps<typeof Link>, 'href' | 'prefetch' | 'onNavigate'> & {
  href: string
  /** Runs before the view changes, so state the new view reads is already set. */
  onShow?: () => void
  /** Navigate through the router instead, while the section it leaves may still be streaming. */
  routerNavigation?: boolean
  /** Leave the page where it is, for a view that opens over this one. */
  keepScroll?: boolean
}) {
  const pendingRoute = useContext(PendingRouteContext)
  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onNavigate={(event) => {
        if (routerNavigation || pendingRoute) return
        event.preventDefault()
        onShow?.()
        showMedicationsView(href, 'push', { keepScroll })
      }}
    />
  )
}
