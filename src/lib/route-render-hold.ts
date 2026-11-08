import 'server-only'

export type HeldRoute = 'history' | 'settings' | 'sign-in-error'

/**
 * Browser-journey seam: lets a journey keep a page unresolved so its route fallback can be proven
 * on routes with no Worker read to hold. The variable is set only by the journey fixture, like
 * `MEDDIES_BROWSER_CLOCK_FILE`; without it this returns at once and adds no wait.
 */
export async function holdRouteRender(route: HeldRoute) {
  const holdUrl = process.env.MEDDIES_BROWSER_ROUTE_HOLD_URL
  if (holdUrl) await fetch(new URL(route, holdUrl), { cache: 'no-store' })
}
