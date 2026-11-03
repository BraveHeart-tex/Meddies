# FE-606 - Production scaffold verification

2026-11-03. Starting commit `3488e66`, current branch `main`.
Owner: [FE-606](https://linear.app/karacadev/issue/FE-606/establish-the-production-nextjs-app-scaffold).

## Result and evidence

| Check                         | Result                                                                                         | Evidence                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Clean install                 | PASS: frozen lockfile in a fresh temporary source copy without dependencies or generated files | [Install/build log](clean-install-build.txt)                                                      |
| Strict typecheck before build | PASS: generates Next route types, then `tsc --noEmit`                                          | [Install/build log](clean-install-build.txt)                                                      |
| Production build              | PASS: Next 16.4.4, static `/` and framework not-found route                                    | [Install/build log](clean-install-build.txt)                                                      |
| Root dev and start            | PASS: HTTP 200, English document/title/heading/text, rendered browser snapshots                | [Local routes](local-routes.txt)                                                                  |
| Existing local suites         | PASS: all three experiment suites; no root suite added                                         | [FE-541](regression-fe-541.txt), [FE-542](regression-fe-542.txt), [FE-544](regression-fe-544.txt) |

Clean verification copies only the root package/lock/config/runtime files and `src`.
The pnpm package cache was reused; no existing `node_modules`, `.next`,
`next-env.d.ts` or incremental TypeScript cache was copied. This verifies source/lock
reproducibility on macOS with Node 22.22.0 and pnpm 11.2.2, not other platforms.
Initial sandboxed server/test attempts could not bind ports; final local checks
ran with loopback access and all passed.

The root source includes only the placeholder and layout. Shared component/utility
directories are documented and created with their first real module. TypeScript
includes production source/config and Next's required generated declarations and
validators; isolated experiments and arbitrary generated output are outside its scope.
Next's `agentRules: false` keeps `next dev` from appending unconditional instructions
to AGENTS.md. Its framework guidance is preserved in
[the Next.js agent document](../agents/nextjs.md), reached through a conditional
root pointer for Next.js implementation, review and debugging work.

## Toolchain and scope decisions

- Exact direct dependencies and pnpm version are in `package.json`; exact transitive
  versions are in `pnpm-lock.yaml`. TypeScript 5.9.3 is a stable supported compiler;
  Next/React peer requirements were checked against registry metadata.
- FE-606 explicitly chooses pnpm but retains an `npm ci` acceptance line. Used
  `pnpm install --frozen-lockfile` as its reproducible equivalent. No root npm lock
  was added; experiment-local manifests/locks were preserved for their separate migration.
- No root test framework is required by FE-606. Existing suites were run as regression
  evidence; no new TDD seam was introduced for the static placeholder.
- No environment secrets, probe routes, production authentication, database, Worker,
  offline behavior, styling system or hosting resources were introduced.

## Hosting handoff

The [README settings table](../../README.md#vercel-settings) records repository root,
Next.js preset, Node major, Corepack build variable, frozen install, build and default
output. Settings were checked against [Vercel build documentation](https://vercel.com/docs/builds/configure-a-build)
and [package manager documentation](https://vercel.com/docs/package-managers).
No deployment, project linking or remote configuration change was performed.
The exact local patch is pinned; Vercel manages its Node 22.x patch version.

## Review

Independent standards and specification reviews of `3488e66...db7c458` found no
actionable issues on either axis. Verification was not rerun by the reviewers.

Uploading the evidence logs to Linear was rejected by automatic approval review
because external upload of these non-public files requires explicit approval.
The logs remain committed here; the issue stays in progress pending that attachment.
