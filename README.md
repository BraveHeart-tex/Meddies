# Meddies

Production Next.js App Router scaffold. Product requirements remain in
[FE-539](https://linear.app/karacadev/issue/FE-539/meddies-private-mvp-product-and-engineering-specification)
and the [Meddies documentation index](https://linear.app/karacadev/document/meddies-00-agent-guide-and-documentation-index-b487477f52de).

## Local development

Use the Node version in `.node-version` / `.nvmrc` and pnpm version in
`package.json`. With fnm installed:

```sh
fnm install
fnm use
npm install --global pnpm@11.2.2
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:3000](http://localhost:3000). The root route is the private sign-in entry.

For private sign-in, follow [Authentication](docs/authentication.md).

To run Next.js with local Worker/D1, follow the [local stack guide](docs/local-stack.md).

## Documentation

See the [AGENTS.md documentation index](AGENTS.md#documentation-index) for
development conventions, verification, authentication, and deployment guidance.
