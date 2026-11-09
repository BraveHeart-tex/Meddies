# Tickets

How to write Linear issues so an agent can finish them without guessing. The
`/to-tickets` and `/triage` skills follow these rules. Labels are defined in
[triage labels](triage-labels.md), terms in [GLOSSARY.md](../GLOSSARY.md).

## Selecting work

When asked for the next task, read the top row of the
[Meddies What's Next view](https://linear.app/karacadev/view/meddies-whats-next-e5459d3a2a92).
Linearis has no custom-view command. From the repo root, fetch candidates with:

```sh
node scripts/linear-next.mjs | jq '{view, next}'
```

`next: null` means the view is empty. The helper refuses view settings it cannot
reproduce (grouping, nesting, unsupported ordering); its header comment covers
credentials and upgrades. If it fails, fix the helper or run `linearis auth login`.

Read the selected issue, its discussions and current blockers through Linearis
before starting. Keep task order and blocker relations in Linear; fetch them again
when selecting work.

## Shape

Each ticket is a **tracer bullet**: one narrow, complete path through every layer
it touches, proven on a real screen or test. A shared primitive ships together
with the first screen that uses it. Size each ticket for one fresh context window.

```markdown
## Parent

FE-n

## What to build

The end-to-end behaviour from the user's side, and an "Out of scope:" line naming
the ticket that owns each nearby item.

## Acceptance criteria

- [ ] One checkable outcome per line, citing design frames as `647·M6`
```

- For lab frames, hand off the lab slug (for example `/lab/649-l1`), frame citation
  and linked Linear capture evidence with design approval. Reuse the same production
  components and evidence; HTML snapshots remain supported (see [design guide](design/README.md)).
- Set blockers as native Linear relations. Add a "Blocked by" section only when a
  blocker cannot be linked.
- Describe behaviour, not file paths. Link stable docs and design artifacts.
- When handing off a design frame, quote its key geometry (sizes, radii, gaps, copy) in
  the ticket. Commit the approved artifact as a snapshot in [docs/design](design/README.md).
- Five acceptance criteria at most. More means the ticket holds two slices: split it.
- Evidence is an assertion, not a record: "the journey asserts layout shift ≤ 0.01",
  not "measure and record a budget". The assertion's comment carries the justification.
- A ticket may ask for a browser journey only by naming an
  [allowed reason](verification.md#when-a-journey-is-allowed). Otherwise it says
  "Tests prove…".
- A ticket with sub-issues is a parent. It lists the slices, an ownership list
  and the shared rules, and its only criterion is that the slices are Done.

## Ownership

Every item, including every design frame, has exactly one owner ticket, named
everywhere the item is mentioned. An item listed under two tickets is effectively
unowned and gets skipped.

## Creating

- For every FE issue, including sub-issues, pass
  `--project "Meddies - Medication Reminder & Tracker"`. Without it the user
  cannot see the issue.
- Give each ticket one category label, one state label and at least one area label.
  A ticket that spans both areas gets `backend` and `frontend`. Use `ready-for-agent`
  only for tickets from a breakdown the user approved. Every other new ticket gets
  `needs-triage`.
- Set priority: Urgent for the single head of the critical path, High for the rest
  of the critical path, Medium for work that blocks nothing on it, Low for human
  checks. Leave parents without a priority.
- A critical-path ticket ends with an "On completion" section: set this ticket
  back to High and set the next critical-path ticket to Urgent, or that ticket's
  open blockers if it is still blocked.
- A ticket that must wait for triage gets a `ready-for-human` reminder ticket. The
  reminder is blocked by the ticket that triggers triage, and it blocks the ticket
  being triaged.

## Changing scope

Rewrite the description so it states the current scope as a whole, then add a
comment saying what changed and why. A handoff moves the item into the receiving
ticket's description in the same change, then comments on both tickets.

## Closing

Close a ticket only when every criterion is checked, `pnpm verify:local` passes, the
change is pushed to main, and the evidence comment is recorded in the ticket
([verification](verification.md#evidence-and-completion)).
For any criterion that will not be finished, create a follow-up ticket with a single
owner, link it from this ticket, and remove the item here.
