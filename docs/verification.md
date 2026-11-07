# Verification

## Required checks

After installing dependencies, run from the repository root:

```sh
pnpm verify:local
```

The command runs lint, format check, typecheck, a Webpack production build, and
tests in order. Webpack avoids the Turbopack CSS worker's local port requirement
in restricted agent environments. CI and releases use the default Turbopack build.
The HTTP suite uses the production Next.js build.
Typechecking covers Next.js and Worker source. Tests bundle the Worker and cover
application operations, local workerd/D1 integration, and production Next.js HTTP
paths using synthetic configuration and identities. They do not access production
personal data or prove a deployed Google callback or remote D1 configuration.
`pnpm worker:build` is a dry run; it does not deploy resources.

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
`.worker-build`. Run `pnpm verify:local` after the journeys.

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

Route-owned journeys for streamed routes prove, with delayed server responses:

- On direct loads and uncached client navigation, the authenticated shell and
  section fallbacks appear before server-backed content, and independent reads
  overlap rather than run in sequence.
- Hydration reuses server data, with no duplicate initial browser request for
  the same query.
- Layout stays stable while fallbacks resolve. Measure cumulative layout shift
  across the load and compare it with the route's budget, justified in its ticket.
- Refresh and mutation keep content, stale or out-of-order responses do not
  overwrite newer state, and focus, reconnect and local rollover refresh without
  polling.
- Rejection, lost response and conflict recovery; navigation during a save;
  sign-out or expiry clearing private client state.

Delay and fail responses through journey fixtures, not with timers in product
code. Do not add lint rules that count
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
