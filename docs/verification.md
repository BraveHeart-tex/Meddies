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
with `pnpm exec playwright install chromium`. Build first, then run journeys against
the completed build. Run builds and journeys sequentially when they share `.next` or
`.worker-build`:

```sh
pnpm build --webpack
pnpm worker:build
pnpm test:browser                 # all journeys on iphone-17
pnpm test:browser today-skipped   # one journey, matched by file name
pnpm exec playwright test --project=narrow cozy-visual
```

Global setup fails fast when `.next/BUILD_ID` or `.worker-build/index.js` is missing.
Run `pnpm verify:local` after the journeys.

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
The frozen clock covers Next.js and the Worker only; the browser keeps the real clock,
so pass explicit dates or server-provided times rather than browser-side defaults.
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
