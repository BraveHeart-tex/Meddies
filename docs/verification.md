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
