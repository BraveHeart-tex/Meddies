# Verification

Run from the repository root after installing dependencies.

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
```

`typecheck` generates Next route types before checking production TypeScript.
`build` creates the production `.next` output and checks types.
For a manual production smoke check, run `pnpm start` after building and open
[localhost:3000](http://localhost:3000).
`pnpm test` runs the HTTP authentication suite against a production build using
Node's test runner and synthetic configuration. Run `pnpm build` first.
It never signs into a real Google account or accesses production personal data.

For deployment checks with real Google accounts, see [Authentication](authentication.md#deployment-verification).

Medicine verification adds application-operation tests and a real local workerd/D1
integration. `pnpm test` bundles the Worker first, then runs the full suite,
including the production Next.js HTTP path with synthetic signed sessions.
`pnpm typecheck` checks both Next.js and Worker source. These tests prove local D1
behavior and service integration, not a deployed Google callback or remote D1
configuration. Test databases and identities are synthetic; no production data is
read. `pnpm worker:build` is a dry run and does not deploy resources.
