# Tickets

How to write GitHub issues so an agent can finish them without guessing. The
`/to-tickets` and `/triage-issue` skills follow these rules. Labels are defined in
[triage labels](triage-labels.md). Product
behavior lives in [docs/product](product/README.md); an issue cites and narrows it, never
restates or changes it. A behavior change lands as a doc edit in the same change set.

Use the [Meddies GitHub Project](https://github.com/users/BraveHeart-tex/projects/3) for
issue discovery, including related tickets and legacy `FE-n` references in the `Linear ID`
field. Use direct issue reads for known numbers or URLs. Ticket commands target Meddies
Project 3, read fields by name and look up individual Project items by issue number.
The Project holds Status, Priority and Linear ID.

## Selecting work

Select work in the Meddies Project. Start the selected issue with one command:

```sh
node scripts/start-issue.mjs <n|url>
```

It refuses a closed issue or one with an open blocker, naming the reason. Otherwise it sets
the issue's Project `Status` to In progress (adding the issue to the Project first) and
prints JSON: the issue with its body and comments, `parent`, `subIssues`, `blockedBy`, the
review baseline commit `base`, and `design` (title starts `Design:`). Ticket commands need the
`project` scope (`gh auth refresh -s project`).

## Shape

Each ticket is a **tracer bullet**: one narrow, complete path through the layers it
touches, proven on a real screen or test. A backend slice proven by real-D1 tests is a
complete tracer bullet; its screens follow in their own ticket. A shared primitive ships
with the first screen that uses it. Each ticket fits one fresh context window: the
[size limits](#size) decide, not the length of the description.

## Template

```markdown
## What to build

The behaviour from the user's side in at most 150 words, linking the docs/product section
it implements by its heading anchor (`medication-domain.md#scheduling---approved-contract`).

## Rules

- [Shared save rules](client-state.md#saves) - only what this ticket narrows

## Ownership

- Owns: the commands, screens and frames (`241·A3`) this ticket delivers
- Uses: each existing item it builds on, with its owner (#300)
- Out of scope: each nearby item, with the issue that owns it (#323)

## Current state

- What the ticket depends on that does not exist yet

## Size

Migrations 0 · New screens 1 · Owned frames 2 · Journeys 0 · Proofs 3

## Acceptance criteria

- [ ] One outcome - Evidence: one proof
```

- **What to build** describes behaviour, not file paths. Name the entry point by its
  GLOSSARY or screen term ("Medication detail").
- **Rules** link product and shared docs and add only the narrowing. They never restate a
  linked rule. Omit the section when nothing narrows.
- **Ownership** follows [Ownership](#ownership). Out of scope names an issue for each item.
- **Current state** lists missing infrastructure the triage agent verified in the code,
  such as "No reminder storage or sender exists". A ticket that moves, renames or removes
  controls also lists every test and browser spec that drives them, found by searching
  `tests/` for their labels; each counts toward Proofs. Omit the section when nothing
  relevant is missing.
- **Frame-to-proof mapping** is an optional ticket section. Approved design handoffs
  require it as described in the [build ticket template](../.agents/skills/design-ticket/templates/build-ticket.md).
- The parent is a native sub-issue link and blockers are native blocked-by relationships,
  not body sections. Add a "Blocked by" section only when a blocker cannot be linked.

## Criteria

- One outcome per line, with its one proof after `- Evidence:`. An outcome joined to
  another with a semicolon or listing several proofs is two criteria.
- Criteria state product or technical outcomes. `pnpm verify:local`, pushing, evidence and
  closing are the [done definition](../AGENTS.md), never criteria.
- There is no fixed criterion count; more than eight means the ticket holds two slices.
- Visual criteria name no viewport or text size: every visual check runs at
  [402×874 with normal text](verification.md#visual-verification). Never ask for 320px,
  other widths or enlarged-text captures, even where an older ticket did.
- A design build ticket cites frame IDs with key copy in quotes, never "the approved
  frames". Designs hand off through the
  [design-ticket skill](../.agents/skills/design-ticket/SKILL.md): approved lab frames, the
  approval comment and an "Approved design" frame table.

## Evidence

- Each criterion names its evidence: an existing test, a new test where
  [one is required](verification.md#when-a-test-is-required), or a visual or manual check.
  Never a test per criterion by default.
- Evidence is an assertion, not a record: "the journey asserts layout shift ≤ 0.01",
  not "measure and record a budget". The assertion's comment carries the justification.
- A ticket may ask for a browser journey only by naming an
  [allowed reason](verification.md#when-a-journey-is-allowed). Otherwise it names a cheaper
  proof: "Tests prove…", or a visual or manual check.

## Size

The Size line counts what the ticket adds. Split it when a count passes its limit:

| Count        | Counts                                      | Limit                     |
| ------------ | ------------------------------------------- | ------------------------- |
| Migrations   | New migration files                         | 1                         |
| New screens  | New routes, views and drawers               | 3, and 0 with a migration |
| Owned frames | Design frames the ticket builds             | 4                         |
| Journeys     | Browser journeys added or extended          | 1                         |
| Proofs       | Tests added or extended, plus visual checks | 6                         |

Split by layer before feature: the backend command, migration and real-D1 tests first;
screens, cache publication and journeys next; visual polish last. An atomic invariant
(one transaction, no partial state) belongs whole to the backend slice; it is not a reason
to bundle the screens. A UI ticket that waits on a later action leaves that control out
rather than merging with that action's ticket.

## Parents

A ticket with sub-issues is a parent. It holds the ownership list, the shared rules and a
breakdown of features by layer, and its only criterion is that the sub-issues are closed.
It has no Size line.

## Ownership

Every item, including every design frame, has exactly one owner ticket, named
everywhere the item is mentioned. An item listed under two tickets is effectively
unowned and gets skipped.

## Creating

Use the repository command to create and configure one issue. Write the body to a file
with a quoted heredoc; its text is passed unchanged.

```sh
node scripts/create-issue.mjs --title "..." --body-file "$body_file" \
  --category enhancement --areas frontend --priority High
```

- Category: `bug` or `enhancement`. Areas: `backend`, `frontend` or `backend,frontend`.
- Non-parent tickets require `--priority Urgent|High|Medium|Low`. A parent ticket uses
  `--parent-ticket` instead, without Priority. This mode is separate from `--parent <n>`,
  which attaches the new issue as a native sub-issue.
- Optional `--blocked-by <n>,<n>` sets native blockers.
- `--triage-state` accepts a state label from [triage labels](triage-labels.md), defaulting
  to `needs-triage`. `ready-for-agent` requires `--approved-breakdown`, an explicit
  assertion that the user approved the breakdown.
- Before any GitHub write, the command checks a non-parent body against the
  [template](#template), [criteria](#criteria) and [size](#size) rules, naming each
  problem. Check a body for `gh issue edit` with `node scripts/ticket-lint.mjs <file>`.
  Design tickets (title starts `Design:`) follow the design-ticket skill instead.
- The command reads Status and Priority from the Meddies Project and checks that native
  relationship targets belong to it. It creates the repository issue, attaches it to the
  Project if needed, sets Backlog and applicable Priority, then reads back title, exact
  body, labels, relationships and Project fields.
  Success prints only compact JSON with the number, URL, Status, applicable Priority,
  labels and verified relationships.
- On partial failure, it exits non-zero with the existing issue URL, unfinished steps and
  diagnostics. Fix the reported cause and rerun the same inputs with `--resume <n>`.
  Resume configures that issue without creating another; different content or unexpected
  relationships fail explicitly. If creation itself fails without returning a URL, inspect
  GitHub for a possibly created issue before retrying; use `--resume <n>` if it exists.
- Add sibling references once numbers exist with a separate body-file edit, then read back
  the final text:

  ```sh
  gh issue edit <n> --body-file "$body_file"
  gh issue view <n> --json body
  ```

- Give each ticket one category label, one state label and at least one area label.
  A ticket that spans both areas gets `backend` and `frontend`. Use `ready-for-agent`
  only for tickets from a breakdown the user approved. Every other new ticket gets
  `needs-triage`.
- Set Priority: Urgent for the head of the critical path, High for the rest of it,
  Medium for work that blocks nothing on it, Low for human checks. Leave parents
  without a priority. Blockers decide what is startable; Priority only orders startable
  work, so there is no priority hand-off on completion.
- Work that needs a human gets `ready-for-human` on the issue itself and is assigned to
  the maintainer; it blocks the issues that wait on it.

## Changing scope

Rewrite the description so it states the current scope as a whole, then add a
comment saying what changed and why. A handoff moves the item into the receiving
ticket's description in the same change, then comments on both tickets.

## Closing

Close a ticket once it is done ([AGENTS.md](../AGENTS.md)) with one command:

```sh
node scripts/finish-issue.mjs <n> --evidence <file> [--attach <png>...]
node scripts/finish-issue.mjs <n> --existing-evidence <comment-url>
```

`--evidence` posts the [evidence](verification.md#evidence) file as a new comment; reference
each attached PNG as `![frame](./<png>)` in it. `--existing-evidence` reuses a comment
already on the issue, such as a design approval comment, without posting a duplicate. The
evidence must cite a commit on `origin/main`. The command checks everything before writing,
then ticks the Acceptance criteria boxes, closes the issue as completed and sets Project
Status to Done, reading each write back. A failed step stops it and prints the writes done
and the steps remaining; finish those by hand.

For any criterion that will not be finished, first create a follow-up ticket with a single
owner, link it from this ticket, and remove the item here.
