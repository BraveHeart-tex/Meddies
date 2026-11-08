Keep plans extremely concise. Sacrifice grammar for concision.
Always use normal dashes instead of em dashes.

Done means: `pnpm verify:local` passes, every ticket criterion is checked, the change is
pushed to main, and the evidence comment is in the active Linear issue. The maintainer
checks the Release verify job. Progress and verification live in Linear; repo docs hold
only durable rules, setup and architecture.

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
| Asking for or adding a browser journey            | [when a journey is allowed](docs/verification.md#when-a-journey-is-allowed)                |
| Running the app with local Worker/D1              | [local stack](docs/local-stack.md)                                                         |
| Releases, deployment, recovery                    | [deployment](docs/deployment.md)                                                           |

## Linear

Use the `linearis` skill. Write multiline bodies to a file with a quoted heredoc, pass
them as `--body "$(cat "$body_file")"`, then read back the saved text.
