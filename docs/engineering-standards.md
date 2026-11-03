# Engineering standards

Foundation owner: [FE-606](https://linear.app/karacadev/issue/FE-606/establish-the-production-nextjs-app-scaffold).
Linear remains authoritative for product requirements and approved decisions;
start from the [documentation index](https://linear.app/karacadev/document/meddies-00-agent-guide-and-documentation-index-b487477f52de).

## Source and dependency boundaries

- Keep one root Next.js App Router application. Put routes in `src/app`, shared
  components in `src/components`, and shared utilities/integrations in `src/lib`.
  Create those shared directories when they contain real code.
- Add `src/features/<feature>` with its first feature. Introduce a workspace package
  only for a separately deployed Worker/shared runtime justified by completed spikes;
  document the reason in the owning ticket.
- Keep `experiments/` manifests, locks, source and verification independent. Read
  experiments as evidence; production must not import them or inherit probe routes,
  debug behavior or credentials. Root checks target production source/config only.
- Use pinned pnpm and exact direct dependency versions with the committed root
  lockfile. Use the pinned local Node version; Vercel pins the major and manages patches.
- Keep strict TypeScript and normal Next build errors enabled. Generated build output
  is outside application source checks, except Next's generated route declarations
  and validators explicitly included by `tsconfig.json`.
- Use Server Components by default. Keep secrets and server configuration in server
  modules; add `import "server-only"` (and its dependency) when the first such module
  is introduced. Client modules may import only browser-safe code and public values.
- Add concrete behavior before abstractions. Service/repository/provider frameworks,
  empty feature trees and speculative dependencies do not belong in the scaffold.

## Checks and follow-on standards

Run `pnpm typecheck` during changes and `pnpm build` before completion. See the
[README](../README.md) for setup and command details.

- [FE-607](https://linear.app/karacadev/issue/FE-607/standardize-linting-formatting-and-fast-git-hooks)
  owns linting, formatting and fast Git hooks.
- [FE-609](https://linear.app/karacadev/issue/FE-609/establish-tailwind-and-shadcn-ui-conventions)
  owns Tailwind/shadcn conventions and the initial accessible UI primitives.
- [FE-551](https://linear.app/karacadev/issue/FE-551/sign-in-privately-with-google)
  owns production authentication and its environment configuration.

Implement each standard under its own ticket; the placeholder establishes no
product navigation, visual system or authentication behavior.
