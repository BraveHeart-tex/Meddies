Keep plans extremely concise. Sacrifice grammar for concision.
Always use normal dashes instead of em dashes.

Done means: `pnpm verify:local` passes, every ticket criterion's box is ticked, the change is
pushed to main, and the evidence comment is in the active GitHub issue. Then close the
issue without waiting for Release; the maintainer checks the latest green Release run
containing the commit. Progress and verification live in GitHub Issues; repo docs hold
product behavior, durable rules, setup and architecture.

Use [GLOSSARY.md](GLOSSARY.md) terms verbatim in code, docs and tickets; UI copy follows
[docs/copy.md](docs/copy.md).

## Docs

Read the matching doc before starting the work.

Docs state current rules. When behavior changes, rewrite the rule in place; history goes in
commits and issues, and per-feature detail in the owning module's header comment.

| Work                                              | Read                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Committing, PR descriptions                       | [commits](docs/commits.md)                                         |
| Product behavior, approved decisions              | [product docs](docs/product/README.md)                             |
| Tickets: selecting, writing, splitting, closing   | [tickets](docs/tickets.md), [triage labels](docs/triage-labels.md) |
| UI: screens, components                           | [DESIGN](DESIGN.md)                                                |
| UI copy: labels, messages, push reminders         | [copy](docs/copy.md)                                               |
| Design lab frames such as `109·L1`                | [design lab](docs/design/README.md)                                |
| Design tickets: directions, approval, hand-off    | [design-ticket skill](.agents/skills/design-ticket/SKILL.md)       |
| Forms                                             | [forms](docs/forms.md)                                             |
| Routes, rendering, data loading, TanStack Query   | [Next.js](docs/nextjs.md)                                          |
| Saves, drafts, retries, session end               | [client state](docs/client-state.md)                               |
| Layers: operations, contracts, Worker, migrations | [architecture](docs/architecture.md)                               |
| Sign-in, sessions, authorization                  | [authentication](docs/authentication.md)                           |
| Tests, evidence                                   | [verification](docs/verification.md)                               |
| Browser journeys: allowed, writing, running       | [browser journeys](docs/verification.md#browser-journeys)          |
| Running the app with local Worker/D1              | [local stack](docs/local-stack.md)                                 |
| Releases, deployment, recovery                    | [deployment](docs/deployment.md)                                   |

## GitHub Issues

Use `gh` ([tickets](docs/tickets.md)). Write multiline bodies to a file with a quoted
heredoc, pass them as `--body-file "$body_file"`, then read back the saved text. Cite
issues as `#n`; an `FE-n` in old commits or issue bodies is a legacy Linear ID: resolve it
with `gh issue list --search '"Linear ID: FE-n" in:body' --state all`.
