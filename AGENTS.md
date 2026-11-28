Keep plans extremely concise. Sacrifice grammar for concision.
Always use normal dashes instead of em dashes.

Done means: `pnpm verify:local` passes (`pnpm format:check` for a change touching only
`docs/**` and Markdown), every ticket criterion's box is ticked, the change is pushed to
main, and the evidence comment is in the active GitHub issue. Then close the issue without
waiting for Release; the maintainer checks the latest green Release run containing the
commit. Progress and verification live in GitHub Issues; repo docs hold
product behavior, durable rules, setup and architecture.

Use [GLOSSARY.md](GLOSSARY.md) terms verbatim in code, docs and tickets; UI copy follows
[docs/copy.md](docs/copy.md).

## Docs

Start from the owning code, then open the row sections that govern it, not whole docs; list
a doc's sections with `rg -n '^#' <file>`. Open workflow sections (checks, evidence,
commits, closing) at the step that runs them.

Docs state current rules. When behavior changes, rewrite the rule in place; history goes in
commits and issues, and per-feature detail in the owning module's header comment.

| Work                                            | Open                                                                                                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product behavior, approved decisions            | [product index](docs/product/README.md), then the cited topic section                                                                                                                                |
| Tickets                                         | [selecting](docs/tickets.md#selecting-work), [scope](docs/tickets.md#changing-scope), [closing](docs/tickets.md#closing), [creating](docs/tickets.md#creating), [labels](docs/triage-labels.md)      |
| UI: screens, components                         | [foundations](DESIGN.md#foundations), [components](DESIGN.md#components), [screens](DESIGN.md#screens), [loading and saving](DESIGN.md#loading-and-saving)                                           |
| UI copy: labels, messages, push reminders       | [voice](docs/copy.md#voice), [errors](docs/copy.md#errors), [reminder wording](docs/copy.md#reminder-wording), [changing copy](docs/copy.md#changing-copy)                                           |
| Design lab frames such as `109·L1`              | [finding a design](docs/design/README.md#finding-a-design), [built frames](docs/design/README.md#built-frames), [outlines](docs/design/README.md#outlines), [capture](docs/design/README.md#capture) |
| Design tickets: directions, approval, hand-off  | [design-ticket skill](.agents/skills/design-ticket/SKILL.md)                                                                                                                                         |
| Forms                                           | [forms](docs/forms.md)                                                                                                                                                                               |
| Routes, rendering, data loading, TanStack Query | [rendering](docs/nextjs.md#server-rendering-and-streaming), [cache](docs/nextjs.md#cache-prefetch-and-freshness), [query ownership](docs/nextjs.md#query-ownership)                                  |
| Saves, drafts, retries, session end             | [saves and retries](docs/client-state.md#saves), [session drafts](docs/client-state.md#session-drafts), [session end](docs/client-state.md#session-end)                                              |
| Layers, contracts, Worker, migrations           | [layers](docs/architecture.md#nextjs-layers), [Worker](docs/architecture.md#worker), [persistence](docs/architecture.md#persistence-rules), [schema changes](docs/architecture.md#schema-changes)    |
| Sign-in, sessions, authorization                | [authorization](docs/authentication.md#authorization), [sessions](docs/authentication.md#sessions-and-revocation)                                                                                    |
| Required proof                                  | [when a test is required](docs/verification.md#when-a-test-is-required), [cheapest proof](docs/verification.md#cheapest-proof)                                                                       |
| Checks, evidence                                | [required checks](docs/verification.md#required-checks), [visual](docs/verification.md#visual-verification), [manual](docs/verification.md#manual-checks), [evidence](docs/verification.md#evidence) |
| Browser journeys: allowed, writing, running     | [browser journeys](docs/verification.md#browser-journeys)                                                                                                                                            |
| Running the app with local Worker/D1            | [local stack](docs/local-stack.md)                                                                                                                                                                   |
| Committing, PR descriptions                     | [commits](docs/commits.md)                                                                                                                                                                           |
| Releases, deployment, recovery                  | [Worker and database](docs/deployment.md#worker-and-database), [verify workflow](docs/deployment.md#verify-workflow), [ordered releases](docs/deployment.md#ordered-releases)                        |

## GitHub Issues

Use the Meddies Project for [issue lookup and creation](docs/tickets.md). Write multiline
bodies to a file with a quoted heredoc, pass them as `--body-file "$body_file"`, then read
back the saved text. Cite issues as `#n`.
