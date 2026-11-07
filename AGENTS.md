Keep plans extremely concise. Sacrifice grammar for concision.
Always use normal dashes instead of em dashes.

Run `pnpm verify:local` for local verification.

Keep task progress and verification summaries in Linear. Create repo documentation
only for durable setup, architecture or operating guidance.

## Issues

Use the `linearis` skill and CLI for Linear work. Read the issue and discussions
before changing them. Record meaningful progress and verification in the active
issue, and keep its description consistent with status changes.

Write multiline Linear updates to a file using a quoted heredoc. Pass the file
contents as one quoted CLI argument, for example `--body "$(cat "$body_file")"`.
Read back the update to confirm the saved text.

## Documentation index

Read matching documents before starting the listed work.

| Work                                                                                                                           | Document                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Git: writing commit messages or PR/MR descriptions, committing changes                                                         | [Commit conventions](docs/agents/commits.md)                                                      |
| UI: designing, building or reviewing screens, components or copy                                                               | [Design system](DESIGN.md), [Product](PRODUCT.md), visual source `.agents/skills/meddies-design/` |
| Design frames: implementing or checking a cited frame such as `649·L1`                                                         | [Design snapshots](docs/design/README.md)                                                         |
| Triage: applying issue labels                                                                                                  | [Triage labels](docs/agents/triage-labels.md)                                                     |
| Tickets: selecting work, creating, splitting, handing off or closing Linear issues                                             | [Tickets](docs/agents/tickets.md)                                                                 |
| Next.js: implementing, reviewing or debugging routes, rendering, data loading, TanStack Query, configuration or framework APIs | [Next.js](docs/agents/nextjs.md)                                                                  |
| Development/API: adding source files, routes/contracts, configuring environments or dependencies                               | [Development conventions](docs/development.md)                                                    |
| Forms: building or changing data-entry forms                                                                                   | [Form conventions](docs/development.md#forms), [Design system](DESIGN.md)                         |
| Local stack: starting, checking or stopping Next.js with local Worker/D1                                                       | [Local stack](docs/local-stack.md)                                                                |
| Storage: implementing, reviewing or debugging the Worker, persistence or medicine operations; configuring storage environments | [Storage](docs/storage.md)                                                                        |
| Verification: running checks or verifying changes                                                                              | [Verification](docs/verification.md)                                                              |
| Authentication: configuring, implementing, reviewing or debugging sign-in, sessions or authorization                           | [Authentication](docs/authentication.md)                                                          |
| Vercel: configuring, reviewing or debugging builds or deployment                                                               | [Deployment](docs/deployment.md)                                                                  |
