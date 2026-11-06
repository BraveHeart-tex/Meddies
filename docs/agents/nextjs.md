# Next.js guidance

Before implementing, reviewing or debugging Next.js routes, rendering,
configuration or framework APIs, read the relevant installed guide under
`<repo>/node_modules/next/dist/docs/`. Follow its version-specific APIs and
deprecation notices. For data loading, start with `fetching-data`,
`linking-and-navigating` and `caching` in `01-app/01-getting-started/`.

The rules below are the approved [FE-620](https://linear.app/karacadev/issue/FE-620/adopt-streaming-ssr-with-tanstack-query-and-fast-client-interactions)
contract (topic 06). They govern new and changed data-driven routes. Today
([FE-624](https://linear.app/karacadev/issue/FE-624/stream-today-into-query-with-optimistic-dose-interactions))
is the reference implementation; do not copy older client-fetch, polling or
`router.refresh()` patterns. Today and History must pass the
[FE-639](https://linear.app/karacadev/issue/FE-639/validate-todayhistory-architecture-before-route-rollout)
gate before other routes adopt this architecture.

## Server rendering and streaming

- Authenticate in the page, not the layout, before rendering private sections.
  An unauthenticated request never reaches private reads or fallbacks that imply
  private data.
- Render the authenticated shell (header, page title, navigation and
  data-independent controls) outside slow data work, so it appears first and
  stays stable while sections stream.
- Load initial data on the server in Server Components, through authenticated
  feature operations. Do not refetch the same data from the browser after
  hydration.
- Start independent reads concurrently: put them in sibling Suspense
  boundaries, or start them before awaiting. Never await one read before starting
  an unrelated one.
- Place `<Suspense>` around each coherent, independently useful section, such as
  the next-dose hero, the dose list or a History date. Await that section's server
  prefetch inside its boundary. Do not wrap every card, and do not split a
  section whose parts are only meaningful together. Justify boundaries by user
  value, not by count.
- Keep `loading.tsx` for route-level navigation feedback. Keep runtime and
  uncached reads out of layouts so they do not block navigation.
- Each streamed section needs an error path that keeps the shell and other
  sections usable and offers a retry.

## Cache, prefetch, authorization and freshness

Record these decisions in the owning ticket for each changed route:

- **Server cache:** Cache Components is not enabled. Private data is
  request-time only; do not use shared caches (`use cache`, `use cache: remote`,
  `fetch` caching) for owner-scoped data. Deduplicate within one request with a
  request-scoped Query client or React `cache`.
- **Prefetch:** use `<Link>` for app destinations. Dynamic routes are prefetched
  only up to `loading.tsx`, or not at all without one; private data loads on
  navigation unless the Query cache already holds it. State any explicit `prefetch` override and its reason.
- **Authorization:** every server read and API route authenticates and scopes by
  the session owner ([authentication](../authentication.md)). Page visibility and
  cached client data are not authorization.
- **Freshness:** state each query's stale time and refresh triggers, which
  mutations reconcile it, and which local clock changes (due time, day rollover)
  it depends on.

## Query ownership

- Create one Query client per server request and one stable browser client per
  authenticated session. Never share a client across users or requests.
- Server sections prefetch into the request client and hydrate it with
  `HydrationBoundary`. Dehydrate only display data: no secrets, capabilities or
  session tokens. Dehydrating pending queries is optional, on measured benefit.
- After hydration, TanStack Query owns interactive medicines, schedules and
  dated history. Related lists, counts and statuses read the same cache entries.
  Do not render server-fetched live values (counts, statuses) beside
  Query-backed views, because the two can drift.
- Browser reads call authenticated API routes. Browser components never import
  server modules or storage transport.
- Use shared query keys. Mutations update and reconcile those exact keys.
- Retain usable cached content while stale data refreshes. Refresh stale queries
  on screen entry, window focus and reconnect, and reconcile targeted queries
  after mutations. Do not poll routinely. Advance due-time and day status from the
  local clock; fetch newly required dates instead of inventing coverage.
- Newer optimistic or confirmed state wins over late hydration, stale reads and
  out-of-order responses. Cancel or ignore outdated in-flight reads before
  optimistic updates, and compare revisions when reconciling.

## Session interaction

Lifetime and Drafts are the target state, delivered by FE-638. Until it lands,
forms keep values and pending saves only while their screen is mounted.

`/medications` query states (`?add`, `?medicine`, `?schedule`) render one mounted
`MedicinePanel`, so its client state persists across them; reset per-screen state
when the screen changes.

- **Mutations:** each user attempt gets one action ID, reused on every retry
  ([storage](../storage.md#client-writes)). Dose recording
  and correction update the affected Today and History cache entries
  optimistically, with a visible unconfirmed state. Apply the authoritative
  response, then reconcile; do not call `router.refresh()` routinely.
- **Rollback:** on definite rejection, roll back only that mutation's change,
  never a newer unrelated one. A timeout or lost response is uncertain receipt:
  keep the attempted details and action ID, reconcile, and offer a retry of the
  same request. Conflicts need explicit user recovery, never last-write-wins.
- **Lifetime:** mutation tracking lives above routes, so pending saves and
  failures survive screen unmount and navigation and stay visible at app level.
  Navigation never cancels submitted work.
- **Drafts:** keep unfinished medicine, schedule and dose drafts in session
  memory across in-app navigation; clear them on confirmed submission or explicit
  discard. Drawer dismissal follows [DESIGN.md](../../DESIGN.md) (FE-631). Keep
  the selected History date in the URL.
- **Online only:** setup, schedule edits and snooze are server-confirmed with no
  optimistic state. New writes need connectivity. Optimistic dose display does
  not establish server receipt, stock changes or reminder cancellation.
- **Session end:** follow [authentication](../authentication.md#sessions-and-revocation)
  for clearing client state.
- **Deferred:** in-memory state need not survive reload, app closure or browser
  eviction. Persistent offline viewing, queued offline writes, real-time
  cross-device sync and background sync are out of scope.
