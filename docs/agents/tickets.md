# Tickets

How to write Linear issues so an agent can finish them without guessing. The
`/to-tickets` and `/triage` skills follow these rules. Labels are defined in
[triage labels](triage-labels.md), terms in [GLOSSARY.md](../../GLOSSARY.md).

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
- [ ] `pnpm verify:local` and the relevant browser journeys pass, and the evidence is recorded here
```

- Set blockers as native Linear relations. Add a "Blocked by" section only when a
  blocker cannot be linked.
- Describe behaviour, not file paths. Link stable docs and design artifacts.
- Write "Tests prove…" for logic and UI states. Name a browser journey only for
  behaviour that needs a real browser and app: route navigation, SSR, hydration and
  streaming, layout and viewport, or the auth and Worker path
  ([verification](../verification.md)).
- A ticket with sub-issues is a parent. It lists the slices, an ownership list
  and the shared rules, and its only criterion is that the slices are Done.

## Ownership

Every item, including every design frame, has exactly one owner ticket. Name that
ticket everywhere the item is mentioned. Writing two owners ("FE-638/FE-624")
leaves the item unowned. That pattern is how FE-644 skipped work.

## Creating

- Pass `--project "Meddies - Medication Reminder & Tracker"`. Without it the user
  cannot see the issue.
- Give each ticket one category label and one state label. Use `ready-for-agent`
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

Close a ticket only when every criterion is checked. For any criterion that will
not be finished, create a follow-up ticket with a single owner, link it from this
ticket, and remove the item here. Record the evidence for each criterion in the
ticket.
