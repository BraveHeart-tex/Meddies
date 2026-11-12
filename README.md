# Meddies

Production Next.js App Router scaffold. Product requirements live in
[docs/product](docs/product/README.md); work is tracked in
[GitHub Issues](https://github.com/BraveHeart-tex/Meddies/issues) and the
[Meddies Project](https://github.com/users/BraveHeart-tex/projects/3).

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

See the [AGENTS.md docs index](AGENTS.md#docs) for
development conventions, verification, authentication, and deployment guidance.
