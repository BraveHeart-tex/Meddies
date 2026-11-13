# Next.js

The installed Next.js may postdate your knowledge. For patterns `src` already uses, copy
the repo. Before using a framework API, file convention or config option that `src` does
not use yet, or after a deprecation warning, read only that API's page in the installed
docs:

```sh
rg -l '<api>' node_modules/next/dist/docs/01-app/03-api-reference
```

These rules govern new and changed data-driven routes. Today is the reference
implementation: copy its streaming source. Saves, drafts and session end follow
[client state](client-state.md).

## Reference: Today

- Page: [`src/app/page.tsx`](../src/app/page.tsx) authenticates, renders the shell and
  [`TodayHeader`](../src/features/schedules/today-header.tsx), and streams one data handoff
  in `<Suspense>` with `PrivateQueryHandoff`.
- Server prefetch: [`schedules/prefetch.ts`](../src/features/schedules/prefetch.ts) into the
  request client from [`request-query-client.ts`](../src/lib/request-query-client.ts).
- Section: [`schedule-panel.tsx`](../src/features/schedules/schedule-panel.tsx) and
  [`today-schedule.tsx`](../src/features/schedules/today-schedule.tsx); stable host
  [`today-doses-section.tsx`](../src/features/schedules/today-doses-section.tsx) (the cached
  section on warm navigation, else
  [`today-skeleton.tsx`](../src/features/schedules/today-skeleton.tsx)).
- Query keys and options: [`schedules/queries.ts`](../src/features/schedules/queries.ts),
  [`medicines/queries.ts`](../src/features/medicines/queries.ts).
- Specs: [`today-streaming.spec.ts`](../tests/browser/today-streaming.spec.ts),
  [`today-schedule.test.tsx`](../tests/today-schedule.test.tsx).

Lessons from Today:

- A shell component outside a section's `HydrationBoundary` watches that section's cache
  with `useCachedQueryData` (`src/lib/use-cached-query-data.ts`) rather than creating its
  query, even with `enabled: false`: hydration of an existing query is deferred to an
  effect, so the section's observer would fetch again.
- The server cannot see the browser cache. Today keeps its interactive section outside
  Suspense, showing cached content while a data-only handoff streams. Completion hydrates
  the same mounted section; it never replaces open drawers or their Session drafts. Without
  usable data the host shows the skeleton until hydration, then query error/retry states
  also become available for failed server reads.
- A query with `staleTime: 0` refetches as it mounts with hydrated data. When the page's
  server prefetch is the entry read, the route's observer sets `refetchOnMount: false`
  (`useScheduleSnapshot({ serverEntry: true })`). Keep `staleTime` as is: focus refresh and
  `fetchQuery`-based fresh reads honour it.
- Modules the server prefetch imports (feature `queries.ts`) use server-safe code only,
  without client hooks such as `useSyncExternalStore`.

## Server rendering and streaming

- Authenticate in the page, not the layout, before rendering private sections, so an
  unauthenticated request reaches neither private reads nor fallbacks that imply private
  data.
- Render the authenticated shell (header, page title, navigation and data-independent
  controls) outside slow data work, so it appears first and stays stable while sections
  stream.
- Load initial data in Server Components through authenticated feature operations; the
  browser reuses it after hydration.
- Start independent reads concurrently: sibling Suspense boundaries, or start each before
  awaiting any.
- Wrap each coherent, independently useful section in `<Suspense>` (the next-dose hero,
  the dose list, a History date) and await its prefetch inside the boundary. Parts that are
  only meaningful together share one boundary. Justify boundaries by user value.
- `loading.tsx` gives route-level navigation feedback. Layouts stay free of runtime and
  uncached reads so navigation never waits on them.
- Each streamed section has an error path that keeps the shell and other sections usable
  and offers a retry.

## Cache, prefetch and freshness

Record these decisions in the owning ticket for each changed route:

- **Server cache:** Cache Components is off. Private data is request-time only, outside
  shared caches (`use cache`, `use cache: remote`, `fetch` caching). Deduplicate within a
  request with the request Query client or React `cache`.
- **Prefetch:** use `<Link>` for app destinations. Dynamic routes prefetch only up to
  `loading.tsx`, or not at all without one; private data loads on navigation unless the
  Query cache holds it. State any explicit `prefetch` override and its reason.
- **Authorization:** every server read and API route authenticates and scopes by the
  session owner ([authentication](authentication.md)).
- **Freshness:** state each query's stale time and refresh triggers, which mutations
  reconcile it, and which scheduling-clock changes (due time, day rollover) it depends on.

## Query ownership

- One Query client per server request; one stable browser client per authenticated
  session, from `src/lib/session-query-client.ts` via `SessionBoundary`. Each page mounts
  its own boundary and the registry hands every mount the session's client.
- Server sections prefetch into the request client and hydrate with `PrivateQueryHandoff`
  (`src/lib/private-query-handoff.tsx`). Its explicit query-key policies reuse domain merge
  helpers and read live browser data when hydration applies. Register a merge or replacement
  policy before handing off a new private query family; direct hydration primitives belong
  only to this adapter and its focused tests.
  Dehydrate display data only, never secrets, capabilities or session tokens. Dehydrating
  pending queries is optional, on measured benefit.
- After hydration, TanStack Query owns medicines, schedules and dated history. Related
  lists, counts and statuses read the same cache entries, so live values always come from
  Query.
- Browser reads call authenticated API routes, through shared query keys; mutations update
  and reconcile those exact keys.
- Keep cached content on screen while stale data refreshes. Refresh on screen entry,
  window focus (`visibilitychange` and `focus`) and reconnect, and reconcile targeted
  queries after mutations; there is no routine polling or `router.refresh()`.
- Advance due-time and day status from `useSchedulingClock()`, and fetch newly required
  dates rather than inventing coverage.
- Newer pending or confirmed state wins over late hydration, stale reads and out-of-order
  responses: cancel or ignore outdated reads before writing confirmed state, and compare
  revisions when reconciling. Which state may be optimistic:
  [client state](client-state.md#saves).
