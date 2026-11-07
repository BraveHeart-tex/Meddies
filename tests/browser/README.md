# Browser journeys

Playwright Test specs in `tests/browser/*.spec.ts`. When to write and run them:
[verification](../../docs/verification.md#browser-journeys).

## Running

Install the browser once with `pnpm exec playwright install chromium`, then use the
wrapper:

```sh
pnpm test:browser:build                 # every journey except @visual, on phone
pnpm test:browser:build today-skipped   # one journey, matched by file name
pnpm test:browser:visual                # only the @visual journeys, on phone
pnpm exec playwright test --project=narrow --grep @visual cozy-visual
```

The wrapper always runs `pnpm worker:build`, runs `next build --webpack` only when the
build is stale, then `playwright test --project=phone` with your arguments.
`pnpm test:browser:build` and `pnpm test:browser` (what CI runs) skip journeys tagged
`@visual`; `pnpm test:browser:visual` is the same wrapper selecting only them. Outside CI,
global setup fails fast when a build input is newer than `.next/BUILD_ID`, or when
`.next/BUILD_ID` or `.worker-build/index.js` is missing; rerun through the wrapper. Run
builds and journeys sequentially when they share `.next` or `.worker-build`.

**Dev mode** for iterating on one journey: `MEDDIES_BROWSER_DEV=1 pnpm test:browser <spec>`
starts `next dev --webpack` per test with no production build. Stop any running
`pnpm dev` or `pnpm dev:stack` first (they share the `.next/dev` lock). StrictMode double
effects and on-demand compilation make dev mode iteration-only: confirm streaming, request
counts and layout shift with the wrapper before recording results. `next dev` does not
prefetch, so cold-navigation journeys need the production build.

**Is it already failing on main?** Use a separate worktree instead of stashing:

```sh
git worktree add ../meddies-main origin/main
cd ../meddies-main && pnpm install && pnpm test:browser:build today-skipped
git worktree remove ../meddies-main
```

**Failures** keep a trace, screenshot, video and redacted `service.log` in ignored
`.browser-artifacts/` (cleared each run); open a trace with
`pnpm exec playwright show-trace <path>/trace.zip`. CI uploads that folder as
`browser-artifacts-<attempt>`.

## Projects

`phone` is Chromium at the iPhone 17 CSS size (402x874, portrait), not WebKit, iOS or an
installed PWA, and what `pnpm test:browser` selects; a bare `pnpm exec playwright test` runs every project. `narrow` (320x740) is an
opt-in stress check. Safari toolbars and safe areas shrink the usable height below 874px,
so assert that content scrolls rather than relying on the full height.

## Fixtures

Each spec declares `test.use({ journey: { auth, storage, initialScheduleTime, seed } })`.
[`fixtures.ts`](fixtures.ts) gives each test its own Next.js server, port, fresh local
Worker/D1 database and clock file.

- **Auth** is a short-lived synthetic Auth.js session; no Google provider or real
  credentials. `app.api` and `page.request` act as the signed-in user; the `request`
  fixture stays anonymous.
- **Clock:** every journey that depends on the date or time declares
  `initialScheduleTime`, freezing the scheduling clock for Next.js, the Worker and the
  browser (`useSchedulingClock()`); `app.setScheduleTime` moves it. Auth stays real time so
  sessions stay valid. Use `page.clock` only to advance elapsed time, installed at the
  real current time.
- Spec files run on three workers locally and one in CI or dev mode, with no retries;
  tests within a file run serially.

## Worker controls

`page.route` sees only browser requests. With `storage`, a Node proxy
([`worker-proxy.ts`](worker-proxy.ts)) sits between Next.js and Miniflare, controlled through
`app.worker`. Seeding and the `/api/session` readiness check bypass it. Product code has no
test hooks.

Next.js calls the Worker as `POST /medicines` or `POST /schedules` with an `operation` in
the body, so rules match a `WorkerRoute`: method, path prefix and optional operation, e.g.
`{ method: 'POST', path: '/schedules', operation: 'listOutcomes' }`.

- `hold(route)`: the Worker runs the request; the response to Next.js waits.
- `release(route?)`: sends held responses matching `route` (all when omitted) and drops the
  hold rules it covers. A broader rule, such as `{ method: 'POST', path: '/' }`, stays
  until released with a route that covers it.
- `fail(route, status)`: answers with `status` without reaching the Worker.
- `delay(route, ms)`: a fixed delay, only when a case needs one; prefer `hold`.
- `clear()`, `held(route?)`, `requests(route?)`: the timing log (method, path, operation,
  status, monotonic `start` and `end`).

## Streaming evidence

[`streaming.ts`](streaming.ts) turns Worker rules into evidence without duration
thresholds:

- `expectReadsOverlap(worker, routes)`: every route has a held request, so all started
  before any was released.
- `expectStreamingOrder(worker, { routes, fallback, content })`: the fallback shows while a
  read is held, then content replaces it after release.
- `blockPrefetch(page, path)` aborts router prefetches for the target; `expectBlocked()`
  asserts one was aborted. Install it before the linking page loads.

Route journeys hold their reads first, then navigate: `page.goto(url, { waitUntil:
'commit' })` for a direct load (a held stream never fires `load`), or a link click after
`blockPrefetch` for a cold client navigation. Then call both assertions.
[`today-streaming.spec.ts`](today-streaming.spec.ts) is the reference, including failure with
`fail(route, 503)`, the request counter and a layout-shift budget.

## Request counts and layout shift

**Request counter** ([`requests.ts`](requests.ts)): `countApiRequests(page, app.origin)`
counts browser requests per app API path, any method, query ignored. Server reads never
appear, so zero proves hydration reuse. Start it before `page.goto`, `reset()` just before
a client navigation, and read it after content is visible (on a direct load, after
`waitForLoadState('load')`).

**Layout helper** ([`layout.ts`](layout.ts)): `trackLayout(page, viewport)` observes
`layout-shift` from the next document, so call it before `page.goto`; call `start()` just
before a client-navigation click. `snapshot(stage)` records shell boxes; `result()`
returns `cumulativeLayoutShift`, `shifts`, `inputShift(s)` and the snapshots. New checks
use 402px, adding 320px when narrow layout is affected. Limits:

- Chromium only (Layout Instability API), not WebKit or a real iPhone.
- A plain sum since the start, not web-vitals' session window, so long loads score higher.
- Shifts within 500ms of input are excluded, so cold-navigation numbers undercount; budget
  against direct loads.
- Inserted or removed elements are not shifts: compare `fallback` and `loaded` snapshot
  boxes to catch geometry jumps.

## Loading captures

Visual journeys are tagged `@visual` and run only through `pnpm test:browser:visual`:
`history-spacing`, `cozy-visual` and `loading-capture`.

[`capture.ts`](capture.ts) produces opt-in review artifacts, never a CI baseline.
`loading-capture.spec.ts` registers routes (name, path, fallback and content locators). The
helper holds every Worker read, saves the fallback, releases and saves the loaded page,
and writes `loading-capture.json` (case, status labels, overflow, shell boxes).

```sh
MEDDIES_VISUAL_OUT=/tmp/meddies-capture pnpm test:browser:visual loading-capture
MEDDIES_VISUAL_OUT=/tmp/meddies-capture MEDDIES_CAPTURE_ROUTES=today MEDDIES_CAPTURE_CASES=phone,reduced-motion pnpm test:browser:visual loading-capture
```

Cases: `phone` (402x874, the default), `narrow` (320x740) and `reduced-motion` (402x874), or
a typed `CaptureCase[]` for a specific risk. Omitting `MEDDIES_CAPTURE_ROUTES` selects all
registered routes; unknown or empty selections fail. Viewport resizing is not text
enlargement or zoom. A route that loads in the client uses its client loading status as
the fallback.

`cozy-visual` saves design-review screenshots at the running project's viewport; set
`MEDDIES_VISUAL_OUT` to keep them outside `.browser-artifacts/`.

## Locators

Enforced by lint in `tests/browser/**`:

- Prefer role, then label, then text, then a domain `data-*` id such as `data-dose-id`.
- Raw CSS selectors live only in [`locators.ts`](locators.ts) as named domain locators, such
  as `doseRow(page, dueAt)`.
- `page.evaluate` lives only in [`actions.ts`](actions.ts), each helper commented with why no
  user-facing API works.
- Wait with web-first assertions.
