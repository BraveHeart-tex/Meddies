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

## Manual checks

### Browser journeys

Journeys are Playwright Test specs in `tests/browser/*.spec.ts`. They stay manual,
outside `pnpm verify:local` and CI. Install the browser once with
`pnpm exec playwright install chromium`.

Build first, then run journeys against the completed build. Run builds and journeys
sequentially when they share `.next` or `.worker-build`:

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
worker and no retries. `today-skipped`, `dose-history` and `selected-weekdays` use
the real clock;
`today-skipped` reports a fixture limit during the final minute before
Europe/Istanbul midnight. `pnpm test` remains browser-free.

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
