# Verification

## Required checks

After installing dependencies, run from the repository root:

```sh
pnpm verify:local
```

The command runs lint, format check, typecheck, a Webpack production build, and
tests in order. Webpack avoids the Turbopack CSS worker's local port requirement
in restricted agent environments. CI and releases use the default Turbopack build.
Typechecking covers Next.js and Worker source and test TypeScript, including the
Vitest config.

`pnpm test` builds the Worker bundle, then runs the Vitest projects in
`vitest.config.mts`:

- `unit`: every `.mjs` and `.ts` test that does not load the Worker bundle. Node
  environment, 5s test and hook timeout.
- `component`: `tests/**/*.test.tsx`, under jsdom, 5s test and hook timeout. See
  [Component tests](#component-tests).
- `integration`: the auth and medicine storage suites, which run the Worker bundle
  (`.worker-build`) in local workerd/D1. 30s test and hook timeout. The auth suite
  also starts `next start`, so it needs a production build in `.next` (`pnpm build`).

A test that never settles fails on its project's timeout and names the test. Pass a
per-test timeout only when the test's own deadlines are longer, as the dev-stack
tests do.

```sh
pnpm test:unit                           # unit and component projects, no Worker build
pnpm test:unit tests/http.test.mjs       # one file
pnpm test:unit medications-list          # files matching a name
pnpm test:integration                    # builds the Worker, then integration
```

Tests import `test` and hooks from `vitest`; there are no global test functions.
They use synthetic configuration and identities. They do not access production
personal data or prove a deployed Google callback or remote D1 configuration.
`pnpm worker:build` is a dry run; it does not deploy resources.

## Component tests

Component tests prove a screen's loading, refresh and failure states in seconds,
without a browser, server or Worker. They render the real feature component with
React Testing Library and assert with jest-dom matchers, registered in
`tests/helpers/component-setup.ts`.

- Network: MSW (`tests/helpers/msw-server.ts`) answers at the network layer. Each test
  adds its handlers with `server.use`, counting reads where the test needs it. An
  unhandled request fails the test.
- Query: each test creates a client with `createQueryClient()`, never
  `sessionQueryClient()`, and seeds cached data with `setQueryData` and `updatedAt`.
- Next.js: mock `next/navigation` with `vi.mock`.
- Time: `vi.useFakeTimers({ shouldAdvanceTime: true })` with async advances: wrap
  `vi.advanceTimersByTimeAsync` in `act`, and pass it to `userEvent.setup({ advanceTimers })`.
- Focus and reconnect: dispatch real DOM events on `window` (`focus` or
  `visibilitychange`, then `offline` and `online`), not Query's managers, so the
  app's listener wiring is proven.
- After each test, the setup file unmounts rendered output, resets MSW handlers and
  restores real timers.

`tests/medications-list.test.tsx` is the reference.

## Browser journeys

Journeys are Playwright Test specs in `tests/browser/*.spec.ts`. The Verify workflow
runs `pnpm test:browser` (`iphone-17`) after `scripts/verify.sh` in the same job,
reusing its default Turbopack `.next` and `.worker-build` outputs, so a failing
journey fails Verify and blocks Release. CI installs Chromium with
`pnpm exec playwright install --with-deps chromium`, caches `~/.cache/ms-playwright`
keyed on the Playwright version, and uploads `.browser-artifacts/` as the
`browser-artifacts-<attempt>` workflow artifact on failure.

Locally, journeys stay opt-in, outside `pnpm verify:local`. Install the browser once
with `pnpm exec playwright install chromium`, then run them through the wrapper:

```sh
pnpm test:browser:build                 # all journeys on iphone-17
pnpm test:browser:build today-skipped   # one journey, matched by file name
pnpm exec playwright test --project=narrow cozy-visual
```

`pnpm test:browser:build [playwright args]` always runs `pnpm worker:build`, runs
`next build --webpack` only when the Next.js build is stale, then runs
`playwright test --project=iphone-17` with the arguments. Outside CI, global setup
fails fast when any build input (`src`, `public`, Next.js, TypeScript and PostCSS
config, `package.json`, lockfile, `.env` files) is newer than `.next/BUILD_ID`; rerun through the
wrapper. Global setup also fails when `.next/BUILD_ID` or `.worker-build/index.js`
is missing. Run builds and journeys sequentially when they share `.next` or
`.worker-build`.

Local journey policy: once after implementation, run the journeys the ticket names
plus the specs that exercise a route or flow the change edits, in one
`pnpm test:browser:build <names>` run. Then run `pnpm verify:local`. List the
journeys by file in the Linear evidence. CI runs all journeys.

For faster iteration on one journey, `MEDDIES_BROWSER_DEV=1 pnpm test:browser <spec>`
starts `next dev --webpack` per test instead of `next start`, with no production
build. It needs only the Worker bundle, adds per-test startup, and is
slower than the wrapper for the full suite. Dev output goes to `.next/dev`, so the
production build stays usable; a running `pnpm dev` or `pnpm dev:stack` holds the
same `.next/dev` lock, so stop it first. Dev mode is for iteration only: React
StrictMode double effects and on-demand compilation mean it is not evidence for
streaming, request counts or layout shift. Confirm with the wrapper before recording
results. Global setup rejects dev mode under `CI`.

To check whether a failure already exists on main, run it in a separate worktree
instead of stashing and rebuilding:

```sh
git worktree add ../meddies-main origin/main
cd ../meddies-main && pnpm install && pnpm test:browser:build today-skipped
git worktree remove ../meddies-main   # when done
```

Projects set the viewport. `iphone-17` (402x874 CSS px, portrait) is the sole user's
device and the one `pnpm test:browser` selects; a bare `pnpm exec playwright test`
runs every project. `narrow` (320x740) is an opt-in stress check. Safari toolbars
and safe areas make the usable height smaller than 874px, so check that content
scrolls rather than relying on the full height.

Each spec declares `test.use({ journey: { auth, storage, initialScheduleTime, seed } })`.
Fixtures in `tests/browser/fixtures.ts` start a per-test Next.js server, a fresh local
Worker/D1 database and, with `initialScheduleTime`, a frozen scheduling clock that
`app.setScheduleTime` moves. `app.api` calls the app API as the signed-in user. Auth uses a short-lived synthetic Auth.js session; no
Google provider or real credentials are used. `page.request` shares the session
cookie for API fixtures; the `request` fixture stays anonymous. Tests run with one
worker and no retries. Every journey that depends on the date or time declares
`initialScheduleTime`, so no journey depends on the wall-clock time it runs at.
The frozen clock covers Next.js and the Worker, and the browser follows it: client
scheduling code reads "now" from `useSchedulingClock()`
(`src/features/schedules/scheduling-clock.tsx`), anchored on the server scheduling time
and advanced by monotonic elapsed time, never the browser wall clock. Lint bans argless
`new Date()` and `Date.now()` in `src/**`; only the server scheduling clock, the schedule
operations default and auth may read the wall clock. Auth stays real time, so sessions
never expire because of the frozen clock. Use `page.clock` only for journeys that must
advance elapsed time, and install it at the real current time, never at
`initialScheduleTime`, so the session stays valid.
`pnpm test` remains browser-free.

### Worker controls and streaming

`page.route` sees only browser requests. Server reads go from Next.js to the Worker, so with
`storage` the fixture puts a Node proxy (`tests/browser/worker-proxy.ts`) in front of
Miniflare, and `app.worker` controls it. Seeding talks to D1 directly and the
`/api/session` readiness check runs before the journey starts, so neither is affected.
Nothing ships in the production build, and product code has no test hooks.

Next.js calls the Worker as `POST /medicines` or `POST /schedules` with an `operation`
in the body, so rules match a `WorkerRoute`: method, path prefix and optional operation.
History reads `{ method: 'POST', path: '/schedules', operation: 'listOutcomes' }` and
`{ method: 'POST', path: '/medicines', operation: 'list' }`.

- `hold(route)`: the Worker runs the request, but the response to Next.js waits.
- `release(route?)`: sends held responses matching `route` (all when omitted) and drops
  hold rules it covers, so later requests pass. A broader hold rule, such as
  `{ method: 'POST', path: '/' }`, stays until released with a route that covers it.
- `fail(route, status)`: answers with `status` without reaching the Worker.
- `delay(route, ms)`: fixed delay, only when a case needs one. Prefer `hold`.
- `clear()`, `held(route?)`, and `requests(route?)`: the timing log of method, path,
  operation, status, and monotonic `start` and `end` (unset while held).

Rules change mid-test, like `setScheduleTime`. `tests/browser/streaming.ts` turns them
into evidence, with no duration thresholds:

- `expectReadsOverlap(worker, routes)`: every route has a held request, so all started
  before any was released. A page that awaits one read before the next times out here.
- `expectStreamingOrder(worker, { routes, fallback, content })`: the fallback is visible
  while a read is held, then content replaces it after release.
- `blockPrefetch(page, path)`: aborts router prefetches (`Next-Router-Prefetch`) for the
  target; `expectBlocked()` asserts at least one was aborted. Install it before the page
  that links to the target loads, so prefetch cannot hide the loading path. `next dev`
  does not prefetch, so cold-navigation journeys need the production build.

Route tickets hold their reads first, then start the navigation: `page.goto(url,
{ waitUntil: 'commit' })` for a direct load, because a held stream never fires `load`,
or a link click after `blockPrefetch` for a cold client navigation. Then call
`expectReadsOverlap` and `expectStreamingOrder`. `history-streaming.spec.ts` is the
reference, including the failure state with `fail(route, 503)`.

### Request counts, layout shift and loading captures

`history-streaming.spec.ts` is the reference for the counter and layout helper.

**Request counter** (`tests/browser/requests.ts`): `countApiRequests(page, app.origin)`
counts the browser's requests per app API path (`/api/schedules`), any method, query
ignored. Server reads go from Next.js to the Worker and never appear, so a zero count
proves the client reused the data the server rendered (hydration reuse). Start it
before `page.goto`; call `reset()` just before a client navigation. A count only proves
absence for requests started by the time it is read, so read it after the content is
visible and, on a direct load, after `page.waitForLoadState('load')`.

**Layout helper** (`tests/browser/layout.ts`): `trackLayout(page, viewport)` sets the
viewport and observes `layout-shift` entries from the next document, so call it before
`page.goto`. Loop over `layoutViewports` (320px and 402px) with one test each, so CI
covers both without the `narrow` project. `snapshot(stage)` records the boxes of the
header, Settings link and Primary nav (or the locators you pass); `result()` returns
`cumulativeLayoutShift`, `shifts`, the separate `inputShift` and `inputShifts`, and the
snapshots. For a client navigation, call `start()` just before the click. Limits:

- Chromium only (Layout Instability API); not WebKit or a real iPhone.
- A plain sum of shifts since the start, not web-vitals' largest five-second session
  window, so a long load can only score higher.
- Shifts within 500ms of input (`hadRecentInput`) are left out of the total. After a
  link click the fallback swap usually falls in that window, so cold-navigation numbers
  undercount; budget against direct loads.
- Elements inserted or removed, such as a fallback replaced by content, are not shifts.
  Compare snapshot boxes between `fallback` and `loaded` to catch geometry jumps.

**Budgets:** a route ticket records `result()` at both widths (log it and attach it as
the test does), then sets a budget with a justification in the ticket and asserts
`cumulativeLayoutShift` against it. Request counts are asserted exactly: zero repeated
initial reads per path after load, unless the ticket justifies otherwise.

**Loading captures** (`tests/browser/capture.ts`): `loading-capture.spec.ts` passes a
route list (name, path, fallback and content locators) to `captureLoading`. For each
route at 402px, 320px and 200% zoom (201x437), with reduced motion on and off, it holds
every Worker read, loads the route, waits for stylesheets and fonts (under
`MEDDIES_BROWSER_DEV=1` the first paint after `commit` can precede the CSS), then saves
the fallback screenshot, releases and saves the loaded one. It writes
`loading-capture.json` with each capture's status labels, horizontal overflow and
shell boxes. It is opt-in and never a CI assertion: the spec skips unless
`MEDDIES_VISUAL_OUT` is set, and writes there.

```sh
MEDDIES_VISUAL_OUT=/tmp/meddies-capture pnpm test:browser:build loading-capture
```

Route tickets add their route to the spec and paste the JSON summary into their issue.
A route whose data loads in the client, like Today before FE-672, uses its client
loading status as the fallback.

Locator policy, enforced by lint in `tests/browser/**`:

- Prefer role, then label, then text, then a domain `data-*` id such as
  `data-dose-id`. Do not add generic `data-testid`.
- Raw CSS selectors live only in `tests/browser/locators.ts` as named domain
  locators, such as `doseRow(page, dueAt)` and `drawer(page)`.
- `page.evaluate` lives only in `tests/browser/actions.ts`, each helper with a
  comment explaining why no user-facing API works.
- No `waitForTimeout`; use web-first assertions.

Artifacts go to ignored `.browser-artifacts/`, which Playwright clears at the start of
each run. Failures keep a trace, screenshot, video and redacted `service.log`; open a
trace with `pnpm exec playwright show-trace <path>/trace.zip`. There is no HTML report.
`cozy-visual` saves screenshots for design review, not as baselines, at the running
project's viewport. Set `MEDDIES_VISUAL_OUT` to keep them outside `.browser-artifacts/`,
for example when capturing `iphone-17` and `narrow` in separate runs.

## Refactors

For a pure-move refactor (code split into modules, no behavior change), review what
the move actually changed:

```sh
scripts/unmoved-diff.sh HEAD            # uncommitted; git add -N new files first
scripts/unmoved-diff.sh main...HEAD     # a branch
```

It drops lines git detects as moved, ignoring indentation. What remains is new glue
(imports, props, hook returns) and real edits; anything that isn't glue needs a reason.
Prettier rewraps after an indentation change also remain; compare them by reading.

## Data-driven changes

Every change to data-driven UI includes a review of each applicable state in
[DESIGN.md](../DESIGN.md#loading-and-saving) against the
[rendering rules](agents/nextjs.md).

Prove each state at the cheapest level that can prove it.

[Component tests](#component-tests) prove, with MSW responses:

- Refresh keeps content.
- Stale or out-of-order responses do not overwrite newer state.
- Focus and reconnect refresh, with no polling.
- Rejection, lost response and conflict recovery.

Route-owned journeys prove behavior only a real browser and app can, with delayed
server responses:

- Streaming order and fallbacks: on direct loads and uncached client navigation,
  the authenticated shell and section fallbacks appear before server-backed
  content, and independent reads overlap rather than run in sequence.
- Hydration reuses server data, with no duplicate initial browser request for the
  same query.
- Layout stays stable while fallbacks resolve. Measure cumulative layout shift
  across the load and compare it with the route's budget, justified in its ticket.
- Stale-on-entry across real navigation.
- Navigation during a save.
- Sign-out or expiry clearing private client state.
- Local rollover, when it depends on the server scheduling clock.

Delay and fail responses through MSW handlers or journey fixtures, not with timers
in product code. Do not add lint rules that count
Suspense boundaries; prove behavior instead.

Record metrics in the active Linear issue: streaming order, request counts,
layout shift, interaction latency where relevant, viewport and project, and
whether evidence is synthetic (Playwright) or from a real iPhone. Synthetic runs
do not prove device performance.

## Manual checks

For ad-hoc exploration and QA outside journeys, `agent-browser` remains available:
`npm i -g agent-browser && agent-browser install`.

For a production smoke check, run `pnpm start` after building and exercise the
changed flow at [localhost:3000](http://localhost:3000).
For deployed authentication changes, follow
[deployment verification](authentication.md#deployment-verification).
For Worker or database deployment changes, verify the changed operation against
the intended deployed service and database.

## Completion

Required checks pass, applicable manual checks are recorded in the active Linear
issue, and any unverified deployment behavior is identified there. Record failed
or blocked checks explicitly; report verification as incomplete while they remain.
