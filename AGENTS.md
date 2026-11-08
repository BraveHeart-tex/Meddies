Keep plans extremely concise. Sacrifice grammar for concision.
Always use normal dashes instead of em dashes.

Done means: `pnpm verify:local` passes, every ticket criterion is checked, the change is
pushed to main with the Release verify job green on that commit, and the evidence comment
with that run's link is in the active Linear issue. Progress and verification live in
Linear; repo docs hold only durable rules, setup and architecture.

Use [GLOSSARY.md](GLOSSARY.md) terms verbatim in code, docs and tickets; UI copy follows
[docs/copy.md](docs/copy.md).

## Docs

Read the matching doc before starting the work.

| Work                                              | Read                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Committing, PR descriptions                       | [commits](docs/commits.md)                                                                 |
| Tickets: selecting, writing, splitting, closing   | [tickets](docs/tickets.md), [triage labels](docs/triage-labels.md)                         |
| UI: screens, components                           | [DESIGN](DESIGN.md), [PRODUCT](PRODUCT.md), visual source `.agents/skills/meddies-design/` |
| UI copy: labels, messages, push reminders         | [copy](docs/copy.md)                                                                       |
| Design frames such as `649·L1`                    | [design snapshots](docs/design/README.md)                                                  |
| Forms                                             | [forms](docs/forms.md)                                                                     |
| Routes, rendering, data loading, TanStack Query   | [Next.js](docs/nextjs.md)                                                                  |
| Saves, drafts, retries, session end               | [client state](docs/client-state.md)                                                       |
| Layers: routes, operations, contracts, Worker, D1 | [architecture](docs/architecture.md)                                                       |
| Sign-in, sessions, authorization                  | [authentication](docs/authentication.md)                                                   |
| Tests, browser journeys, evidence                 | [verification](docs/verification.md)                                                       |
| Running the app with local Worker/D1              | [local stack](docs/local-stack.md)                                                         |
| Releases, deployment, recovery                    | [deployment](docs/deployment.md)                                                           |

## Linear

Use the `linearis` skill. Write multiline bodies to a file with a quoted heredoc, pass
them as `--body "$(cat "$body_file")"`, then read back the saved text.
