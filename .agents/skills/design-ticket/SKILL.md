---
name: design-ticket
description: Run a Meddies design ticket from directions to an approved hand-off. Use for a design ticket, design directions, lab frames, a comparison page, design approval, or rewriting a build ticket to cite approved frames.
user-invocable: true
---

A design ticket ends with approved lab frames and build tickets that cite them by frame ID;
then it closes. You act as the designer: [DESIGN.md](../../../DESIGN.md) and `src/global.css` are
the visual source, production components the material. Lab rules (registry imports, fixtures,
stable ids) live in [docs/design/README.md](../../../docs/design/README.md#design-lab). The
comparison page is temporary standalone HTML, never committed. Invoked without a design ticket:
ask what to design. Work that needs approval gets a design ticket first, written from
[templates/design-ticket.md](templates/design-ticket.md) and created with
`node scripts/create-issue.mjs` (title starts `Design:`, `--triage-state ready-for-human`).
Precedents: #212, #215 and #241 (design tickets), #217 (build ticket citing frames).

Work **lean**: the "Work lean" list in [implement-issue](../implement-issue/SKILL.md)
governs every step here. Capture and the HTTP test launch Chromium and bind ports, so
preflight them once before step 3.

Write `<n>` for the design ticket's issue number; examples below show `215`.

## Steps

1. **Load the issue.** Handed off from implement-issue: reuse its `start-issue.mjs` output and
   `base`. Otherwise run `node scripts/start-issue.mjs <n>`
   ([tickets](../../../docs/tickets.md#selecting-work)) and record `base=<its base>`.
   _Done when_ the issue is In progress and `base` is recorded. A refusal (closed issue or
   open blocker) stops the run: report it and ask.

2. **Map states.** Read the ticket and name its target screen. Load context once per
   [UI build routing](../implement-issue/SKILL.md#ui-build-routing); it covers
   [PRODUCT.md](../../../PRODUCT.md) and [DESIGN.md](../../../DESIGN.md), so neither is
   opened twice. Then read the [docs/copy.md](../../../docs/copy.md) and lab rule sections
   the states need. List every screen and state the ticket's rules and criteria name, plus
   the approved frames to reuse.
   _Done when_ each criterion maps to at least one listed state.

3. **Build three directions.** Each direction is a set of lab frames from production
   components: `<n>-a1…`, `<n>-b1…`, `<n>-c1…`. States every direction shares (saving,
   errors, saved) are `<n>-s1…`. Write each slug and citation out literally. Put the frames
   in `src/features/design-lab/draft/<topic>-frames.tsx`, their lab-only modules beside them
   in `draft/`, and spread them into `draftFrames` in `draft/frames.tsx`. Example data shared
   across designs goes in `lab-fixtures.ts`, data only this design uses in
   `draft/<topic>-model.ts`.
   _Done when_ every listed state has a frame in each direction (or in `-s*`), and
   `pnpm exec vitest run --project integration tests/design-lab-http.test.ts` passes. It
   runs `next start` on the build in `.next`, so with `pnpm dev` stopped, run `pnpm build`
   first when `.next` holds no build.

4. **Capture.** Stop `pnpm dev`, then run `pnpm lab:capture <n>-`
   ([outputs](../../../docs/design/README.md#capture)); it prints the capture folder.
   Open every 402x874 PNG and fix what looks wrong.
   _Done when_ it exits 0 and you have looked at every frame.

5. **Publish the comparison page.** Copy [templates/comparison.html](templates/comparison.html),
   fill each direction (pitch, one figure per frame, facts, trade-offs), mark your
   recommendation and list open questions. Inline the captures, then publish with the
   Artifact tool:
   `node .agents/skills/design-ticket/embed-captures.mjs page.html <capture-folder> > out.html`
   _Done when_ the page is published, shows every frame, and names one recommended direction
   with its reasons.

6. **Get Bora's pick.** Send the page link and ask which direction to approve.
   _Done when_ Bora has named a direction. Apply any requested changes and repeat steps 4 and 5.

7. **Move the winner to `approved/`.** Delete the losing directions' frames and every lab
   module only they used. `git mv` the winner's frames and modules from `draft/` to
   `approved/`, and move its spread from `draftFrames` to `approvedFrames`. Republish the page
   to the same URL as the approved record: approved direction, shared frames, decisions,
   open questions for the build ticket.
   _Done when_ `draft/` holds no `<n>-` frame, `rg -n '<n>·[BC][0-9]' src tests` (adjust
   letters to the losers) finds nothing, and the HTTP test from step 3 passes.

8. **Review.** Read `git diff $base` against the
   [lab rules](../../../docs/design/README.md#rules),
   [citations](../../../docs/design/README.md#citations), DESIGN.md and docs/copy.md, and
   against each criterion. Review lab markup semantics: links and buttons retain their
   native roles; no explicit `role` replaces either. Fix what you accept before posting
   approval.
   _Done when_ every criterion maps to an approved frame, native link and button roles are
   preserved, and every finding is fixed or rejected with a one-line reason.

9. **Verify, commit and push.** With every change made, run `pnpm verify:local >"$log" 2>&1`
   once and read the summary. On failure, fix the cause, rerun only the failed cases until
   they pass, then run `pnpm verify:local` once more. Commit per
   [docs/commits.md](../../../docs/commits.md) and push to main.
   _Done when_ the final verify exited 0 on the final code and the commit is on `origin/main`.

10. **Post the approval comment** on the design ticket from
    [templates/approval-comment.md](templates/approval-comment.md). Reference each 402x874 PNG
    as `![frame](./<png>)` in the body and pass `--attach ./<png>` per file to
    `gh issue comment <n> --body-file <file>`; gh uploads them and rewrites the references.
    _Done when_ the read-back comment shows every approved frame.

11. **Add the frame table** to the design ticket's description as its "Approved design"
    section, from [templates/frame-table.md](templates/frame-table.md), and tick each
    criterion box. A criterion the frames do not meet moves to a follow-up ticket per
    [closing](../../../docs/tickets.md#closing).
    _Done when_ the read-back description lists every approved frame with its slug and every
    remaining box is ticked.

12. **List backend needs.** For every frame rule and every decision made after approval,
    write what the API must accept or return, such as "Clock edit: optional start date
    before the version starts". Check each need against the parsers in the feature's
    `contract.ts` and the Worker's validation, or against the backend ticket's criteria if
    it isn't built yet. A missing need becomes a backend ticket criterion, its own ticket,
    or goes back to Bora. Decisions made once the backend ticket has started become
    their own ticket (#217's Start date gap came from one).
    _Done when_ a "Backend needs" table (need, frames, met by) is posted on the design
    ticket and every row cites the contract, a backend ticket criterion, or Bora's drop.

13. **Write the build tickets** from [templates/build-ticket.md](templates/build-ticket.md):
    rules grouped by frame, open questions turned into decisions or named owners, and every
    criterion citing frame IDs as `215·A3`. Each build ticket owns at most 4 frames
    ([size](../../../docs/tickets.md#size)); split more by screen into several build
    tickets, created with `node scripts/create-issue.mjs` and linked as blockers where one
    waits on another. Map every owned frame to its proving built frame or named production
    state, with navigation steps or fixture setup for non-default states. Keep exactly one
    built frame per design-critical screen; other states can use temporary production-backed
    captures ([built frames](../../../docs/design/README.md#built-frames)). Link each owned
    frame's capture from the design approval comment directly as a capture review reference
    image. Keep the existing built-frame before/after
    [capture review](../../../docs/design/README.md#capture).
    Rewriting an existing build ticket follows
    [changing scope](../../../docs/tickets.md#changing-scope): rewrite the whole description,
    then comment what changed and why. Check each body with
    `node scripts/ticket-lint.mjs <file>` before `gh issue edit`.
    _Done when_ every approved frame is owned by exactly one build ticket, every body passes
    ticket-lint, every read-back includes the complete frame-to-proof mapping and direct
    reference-capture links, has no criterion without a frame ID and no reference to "the
    approved frames" without IDs, and every rewritten ticket has its scope comment.

14. **Close the design ticket.** The approval comment is its evidence; build work is
    tracked in the build tickets. Close it without waiting for Release:
    `gh issue close <n> --reason completed` ([tickets](../../../docs/tickets.md#closing)).
    _Done when_ `gh issue view <n> --json state` reads `CLOSED`.

Report: what changed, what failed, what's next.
