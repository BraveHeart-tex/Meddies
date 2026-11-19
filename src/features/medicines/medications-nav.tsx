'use client'

import {
  createContext,
  useContext,
  useLayoutEffect,
  useSyncExternalStore,
  type ComponentProps,
} from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { medicationManageHref, medicationsHref, parseMedicationsView } from './routes'

const viewChanged = 'medications:viewchange'
function subscribeView(listener: () => void) {
  window.addEventListener('popstate', listener)
  window.addEventListener(viewChanged, listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener(viewChanged, listener)
  }
}
const browserView = () =>
  window.location.pathname === '/medications' ? window.location.search.slice(1) : null

/** Read native entries directly, including after restoring an entry whose Next.js tree came
 * from a reload of another view. The server search params remain the hydration snapshot.
 */
export function useMedicationsView() {
  const params = useSearchParams()
  const search = useSyncExternalStore(subscribeView, browserView, () => null)
  return parseMedicationsView(new URLSearchParams(search ?? params.toString()))
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
  const from = `${pathname}${search}${hash}`
  if (from === href) {
    window.scrollTo(0, 0)
    return
  }
  const before = parseMedicationsView(new URL(from, window.location.origin).searchParams)
  const after = parseMedicationsView(new URL(href, window.location.origin).searchParams)
  if (
    before.mode === 'detail' &&
    after.mode === 'detail' &&
    before.record &&
    after.record &&
    before.medicineId === after.medicineId
  ) {
    scrollRequested = !keepScroll
    const { [fromKey]: entryFrom, [fromBeforeKey]: entryFromBefore } = window.history.state ?? {}
    window.history.replaceState(
      { [fromKey]: entryFrom, [fromBeforeKey]: entryFromBefore },
      '',
      href,
    )
    window.dispatchEvent(new Event(viewChanged))
    return
  }
  // The Add drawer opens and closes over the list without moving it.
  scrollRequested = !keepScroll
  // A pushed entry remembers the view it came from, and where that one came from; history.state
  // survives reload, and Next.js copies its own state in beside it.
  if (method === 'push')
    window.history.pushState(
      { [fromKey]: from, [fromBeforeKey]: window.history.state?.[fromKey] },
      '',
      href,
    )
  else window.history.replaceState(null, '', href)
  window.dispatchEvent(new Event(viewChanged))
}

const fromKey = 'medicationsFrom'
const fromBeforeKey = 'medicationsFromBefore'

/**
 * Returns from a schedule form after saving or an explicit unsaved exit (DESIGN.md "Components").
 * A form pushed from its medication's page, or from the Manage view pushed from that page, goes
 * back to the page's entry, so one Back then leaves it; any other form (a direct link, a router
 * navigation) replaces its own URL with the page.
 */
export function returnToMedicationPage(medicineId: string) {
  const href = medicationsHref({ mode: 'detail', medicineId })
  const state: unknown = window.history.state
  const read = (key: string) =>
    state && typeof state === 'object' && key in state
      ? (state as Record<string, unknown>)[key]
      : null
  const from = read(fromKey)
  if (from === href) window.history.back()
  else if (from === medicationManageHref(medicineId) && read(fromBeforeKey) === href)
    window.history.go(-2)
  else showMedicationsView(href, 'replace')
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
