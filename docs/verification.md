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

Install `agent-browser` and its Chromium runtime once with
`npm i -g agent-browser && agent-browser install`. Build the production app and
Worker with `pnpm verify:local`, or build just the required artifacts with
`pnpm build --webpack` and `pnpm worker:build`. The harness requires
`.next/BUILD_ID` and, for journeys that use storage, `.worker-build/index.js`. Run a journey with an
explicit named viewport:

```sh
pnpm test:browser today-skipped --viewport 390x844
```

Journeys live in `tests/browser/*.journey.mjs`, declare their auth and storage
dependencies, and use a short-lived synthetic Auth.js session plus a fresh local
Worker/D1 database. No Google provider or real credentials are used. Browser
state and failure screenshots are isolated; logs and screenshots are saved under
ignored `.browser-artifacts/`. Journey helpers expose the local origin, an
authenticated HTTP request function, and a session-scoped `agent-browser` CLI
wrapper. The `today-skipped` pilot picks a same-day schedule time one minute
ahead; it reports a fixture limit during the final minute before Europe/Istanbul
midnight. `pnpm test` remains browser-free.

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
