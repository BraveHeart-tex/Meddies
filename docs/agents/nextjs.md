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

Working Today source to copy (streaming, FE-672):

- Page: [`src/app/page.tsx`](../../src/app/page.tsx) authenticates, renders the shell
  and [`TodayHeader`](../../src/features/schedules/today-header.tsx), and streams one
  doses section in `<Suspense>` with `HydrationBoundary`.
- Server prefetch: [`src/features/schedules/prefetch.ts`](../../src/features/schedules/prefetch.ts)
  into the request client from [`src/lib/request-query-client.ts`](../../src/lib/request-query-client.ts).
- Section: [`schedule-panel.tsx`](../../src/features/schedules/schedule-panel.tsx) and
  [`today-schedule.tsx`](../../src/features/schedules/today-schedule.tsx); fallback
  [`today-doses-fallback.tsx`](../../src/features/schedules/today-doses-fallback.tsx)
  (cached section on warm navigation, else the
  [`today-skeleton.tsx`](../../src/features/schedules/today-skeleton.tsx) skeleton).
- Query keys and options: [`src/features/schedules/queries.ts`](../../src/features/schedules/queries.ts),
  [`src/features/medicines/queries.ts`](../../src/features/medicines/queries.ts).
- Browser specs: [`tests/browser/today-streaming.spec.ts`](../../tests/browser/today-streaming.spec.ts);
  component spec [`tests/today-schedule.test.tsx`](../../tests/today-schedule.test.tsx).

Lessons from Today:

- Shell components outside a section's `HydrationBoundary` must not create that
  section's query (not even `enabled: false`). Hydration of an existing query is
  deferred to an effect, so the section's observer fetches it again. Watch the cache
  with `useCachedQueryData` (`src/lib/use-cached-query-data.ts`) instead.
- The server cannot see the browser cache, so a section's Suspense fallback renders
  the cached section when the session already holds its queries, and the skeleton
  only without usable data (DESIGN.md).
- A query with `staleTime: 0` refetches as it mounts with hydrated data. When the page's
  server prefetch is the entry read, the route's observer sets `refetchOnMount: false`
  (`useScheduleSnapshot({ serverEntry: true })`). Do not raise `staleTime` instead:
  focus refresh and `fetchQuery`-based fresh reads honour it.
- Modules the server prefetch imports (feature `queries.ts`) stay free of client-only
  hooks such as `useSyncExternalStore`.

FE-638 slices adopt these rules in stages. Until FE-624 lands, a rule the owning
ticket lists under Out of scope is not a violation. Reviewers: read the owning
ticket's Out of scope before reporting a missing rule.

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
- The browser client comes from `src/lib/session-query-client.ts`, provided by
  `SessionBoundary`. Each page mounts its own boundary; the registry hands every
  mount the same client per session. Focus refresh listens to `visibilitychange`
  and window `focus`.
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
  scheduling clock (`useSchedulingClock()`), never the device wall clock; fetch newly required dates instead of inventing coverage.
  Loading, refresh and failure UI: [DESIGN.md](../../DESIGN.md#loading-and-saving).
- Newer optimistic or confirmed state wins over late hydration, stale reads and
  out-of-order responses. Cancel or ignore outdated in-flight reads before
  optimistic updates, and compare revisions when reconciling.

## Session interaction

Medicine Add and schedule setup drafts and submitted saves live in session memory,
scoped to the browser Query client. Route unmounts never cancel these saves.
The session feedback host keeps pending saves visible and reports confirmation or
recovery through the app-level Toast host (FE-668). Dose save lifetime is owned by FE-624.

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
- **Drafts:** medicine Add and schedule setup keep raw editing values in a separate
  in-memory store scoped to the session Query client, keyed by form and medicine ID.
  Returning restores values through RHF reset, with “Unsaved details from earlier.”
  and a ghost “Clear form”. Confirmed saves and Clear form discard the draft;
  Clear form also resets defaults. Navigation, refresh and clock rollover never
  discard it. No browser storage is used. Dose draft lifetime is owned by FE-624.
  Drawer dismissal follows [DESIGN.md](../../DESIGN.md) (FE-631). Keep
  the selected History date in the URL.
- **Online only:** setup, schedule edits and snooze are server-confirmed with no
  optimistic state. New writes need connectivity. Optimistic dose display does
  not establish server receipt, stock changes or reminder cancellation.
- **Session end:** follow [authentication](../authentication.md#sessions-and-revocation)
  for clearing client state.
- **Deferred:** in-memory state need not survive reload, app closure or browser
  eviction. Persistent offline viewing, queued offline writes, real-time
  cross-device sync and background sync are out of scope.
