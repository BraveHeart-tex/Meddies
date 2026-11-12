# Tickets

How to write GitHub issues so an agent can finish them without guessing. The
`/to-tickets` and `/triage` skills follow these rules. Labels are defined in
[triage labels](triage-labels.md), terms in [GLOSSARY.md](../GLOSSARY.md). Product
behavior lives in [docs/product](product/README.md); an issue cites and narrows it, never
restates or changes it. A behavior change lands as a doc edit in the same change set.

Use `gh` from the repo root (it targets `BraveHeart-tex/Meddies`). Issues live in the
**Meddies** GitHub Project (`gh project list --owner BraveHeart-tex`), which holds
`Status` (Backlog, To Do, In progress, In Review, Done, Canceled), `Priority` (Urgent, High, Medium, Low) and the
legacy `Linear ID`.

## Selecting work

When asked for the next task, take the top row of the Project's **Next up** view: open,
`ready-for-agent`, no open blocker, highest Priority, then lowest number. From the CLI:

```sh
node scripts/next-issue.mjs | jq '{next, candidates}'
```

`next: null` means nothing is ready. The script needs the `project` scope
(`gh auth refresh -s project`). Read the selected issue, its comments and
blockers before starting:

```sh
gh issue view <n> --comments
gh issue view <n> --json parent,subIssues,blockedBy --jq '{parent: .parent.number,
  subIssues: [.subIssues.nodes[] | {number, state}], blockedBy: [.blockedBy.nodes[] | {number, state}]}'
```

Set the Project `Status` to In progress when you start (`gh project item-edit`, or the
board).

## Shape

Each ticket is a **tracer bullet**: one narrow, complete path through every layer
it touches, proven on a real screen or test. A shared primitive ships together
with the first screen that uses it. Size each ticket for one fresh context window.

```markdown
## What to build

The end-to-end behaviour from the user's side, linking the docs/product section it
implements by its heading anchor (`medication-domain.md#scheduling---approved-contract`),
and an "Out of scope:" line naming the issue that owns each nearby item.

## Acceptance criteria

- [ ] One checkable outcome per line, citing design frames as `107·M6`
```

- The parent is a native sub-issue link, not a body section.
- A design hands off as approved lab frames plus the approval comment with their captures
  ([design-ticket skill](../.agents/skills/design-ticket/SKILL.md)); new designs commit no
  HTML snapshot. The design ticket's description gets an "Approved design" frame table
  (frame, slug, what it shows), and the build ticket's rules and criteria cite those frame
  IDs with key copy in quotes, never "the approved frames".
- Set blockers as native blocked-by relationships. Add a "Blocked by" section only when a
  blocker cannot be linked.
- Describe behaviour, not file paths. Link stable docs and design artifacts.
- Five acceptance criteria at most. More means the ticket holds two slices: split it.
- Evidence is an assertion, not a record: "the journey asserts layout shift ≤ 0.01",
  not "measure and record a budget". The assertion's comment carries the justification.
- A ticket may ask for a browser journey only by naming an
  [allowed reason](verification.md#when-a-journey-is-allowed). Otherwise it says
  "Tests prove…".
- A ticket with sub-issues is a parent. It lists the ownership list and the shared rules,
  and its only criterion is that the sub-issues are closed.

## Ownership

Every item, including every design frame, has exactly one owner ticket, named
everywhere the item is mentioned. An item listed under two tickets is effectively
unowned and gets skipped.

## Creating

```sh
gh issue create --title "..." --body-file "$body_file" \
  --label enhancement,frontend,needs-triage --milestone "<milestone>" \
  --project Meddies [--parent <n>] [--blocked-by <n>,<n>]
```

- Always pass `--project Meddies`, then set Status to Backlog and set Priority on the new
  item.

```sh
project=PVT_kwHOBMJPk84BrDnq
item=$(gh project item-list 3 --owner BraveHeart-tex --limit 500 --format json \
  --jq ".items[] | select(.content.number == $n) | .id")
# Status: Backlog
gh project item-edit --project-id "$project" --id "$item" \
  --field-id PVTSSF_lAHOBMJPk84BrDnqzhpX_s0 --single-select-option-id 3058447d
# Priority: Urgent f6825608, High 25485ae3, Medium 097090b1, Low 7424e82b
gh project item-edit --project-id "$project" --id "$item" \
  --field-id PVTSSF_lAHOBMJPk84BrDnqzhpX_wk --single-select-option-id <option>
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
- Pick a milestone when the work belongs to one (`gh api repos/{owner}/{repo}/milestones`).

## Changing scope

Rewrite the description so it states the current scope as a whole, then add a
comment saying what changed and why. A handoff moves the item into the receiving
ticket's description in the same change, then comments on both tickets.

## Closing

Close a ticket once it is done ([AGENTS.md](../AGENTS.md)). Post the
[evidence](verification.md#evidence) with `gh issue comment <n> --body-file <file>`, read it
back, then `gh issue close <n> --reason completed`. Commits never close issues.
For any criterion that will not be finished, create a follow-up ticket with a single
owner, link it from this ticket, and remove the item here.
