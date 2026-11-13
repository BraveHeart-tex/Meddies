---
name: design-ticket
description: Run a Meddies design ticket from directions to an approved hand-off. Use for a design ticket, design directions, lab frames, a comparison page, design approval, or rewriting a build ticket to cite approved frames.
user-invocable: true
---

A design ticket ends with approved lab frames and a build ticket that cites them by frame ID;
then it closes.
`meddies-design` is the visual reference; this skill is the process. Lab rules (registry
imports, fixtures, stable ids) live in [docs/design/README.md](../../../docs/design/README.md#design-lab).
Precedents: #212 and #215 (design tickets), #217 (build ticket citing frames).

Write `<n>` for the design ticket's issue number; examples below show `215`.

## Steps

1. **Map states.** Read the ticket, [DESIGN.md](../../../DESIGN.md), [PRODUCT.md](../../../PRODUCT.md),
   [docs/copy.md](../../../docs/copy.md) and the lab rules. List every screen and state the
   ticket's rules and criteria name, plus the approved frames to reuse.
   _Done when_ each criterion maps to at least one listed state.

2. **Build three directions.** Each direction is a set of lab frames from production
   components: `<n>-a1…`, `<n>-b1…`, `<n>-c1…`. States every direction shares (saving,
   errors, saved) are `<n>-s1…`. Write each slug and citation out literally. Put the frames
   in `src/features/design-lab/draft/<topic>-frames.tsx`, their lab-only modules beside them
   in `draft/`, and spread them into `draftFrames` in `draft/frames.tsx`. Example data shared
   across designs goes in `lab-fixtures.ts`, data only this design uses in
   `draft/<topic>-model.ts`.
   _Done when_ every listed state has a frame in each direction (or in `-s*`), and
   `pnpm exec vitest run --project integration tests/design-lab-http.test.ts` passes. It
   starts its own `next dev` and `next start`, so stop `pnpm dev` and keep a `pnpm build`
   output in `.next` first.

3. **Capture.** Stop `pnpm dev`, then run `pnpm lab:capture <n>-`
   ([outputs](../../../docs/design/README.md#design-lab)); it prints the capture folder.
   Open every 402x874 PNG and fix what looks wrong.
   _Done when_ it exits 0 and you have looked at every frame.

4. **Publish the comparison page.** Copy [templates/comparison.html](templates/comparison.html),
   fill each direction (pitch, one figure per frame, facts, trade-offs), mark your
   recommendation and list open questions. Inline the captures, then publish with the
   Artifact tool:
   `node .agents/skills/design-ticket/embed-captures.mjs page.html <capture-folder> > out.html`
   _Done when_ the page is published, shows every frame, and names one recommended direction
   with its reasons.

5. **Get Bora's pick.** Send the page link and ask which direction to approve.
   _Done when_ Bora has named a direction. Apply any requested changes and repeat steps 3 and 4.

6. **Move the winner to `approved/`.** Delete the losing directions' frames and every lab
   module only they used. `git mv` the winner's frames and modules from `draft/` to
   `approved/`, and move its spread from `draftFrames` to `approvedFrames`. Republish the page
   to the same URL as the approved record: approved direction, shared frames, decisions,
   open questions for the build ticket.
   _Done when_ `draft/` holds no `<n>-` frame, `rg -n '<n>·[BC][0-9]' src tests` (adjust
   letters to the losers) finds nothing, and the HTTP test from step 2 passes.

7. **Commit and push.** Follow [docs/commits.md](../../../docs/commits.md); run
   `pnpm verify:local` first, then push to main.
   _Done when_ verify passed and the commit is on `origin/main`.

8. **Post the approval comment** on the design ticket from
   [templates/approval-comment.md](templates/approval-comment.md). Reference each 402x874 PNG
   as `![frame](./<png>)` in the body and pass `--attach ./<png>` per file to
   `gh issue comment <n> --body-file <file>`; gh uploads them and rewrites the references.
   _Done when_ the read-back comment shows every approved frame.

9. **Add the frame table** to the design ticket's description as its "Approved design"
   section, from [templates/frame-table.md](templates/frame-table.md), and check the
   criteria the frames meet.
   _Done when_ the read-back description lists every approved frame with its slug.

10. **List backend needs.** For every frame rule and every decision made after approval,
    write what the API must accept or return, such as "Clock edit: optional start date
    before the version starts". Check each need against the parsers in the feature's
    `contract.ts` and the Worker's validation, or against the backend ticket's criteria if
    it isn't built yet. A missing need becomes a backend ticket criterion, its own ticket,
    or goes back to Bora. Decisions made once the backend ticket has started become
    their own ticket (#217's Start date gap came from one).
    _Done when_ a "Backend needs" table (need, frames, met by) is posted on the design
    ticket and every row cites the contract, a backend ticket criterion, or Bora's drop.

11. **Rewrite the build ticket** from [templates/build-ticket.md](templates/build-ticket.md):
    rules grouped by frame, open questions turned into decisions or named owners, and every
    criterion citing frame IDs as `215·A3`.
    _Done when_ the read-back build ticket has no criterion without a frame ID and no
    reference to "the approved frames" without IDs.

12. **Close the design ticket.** The approval comment is its evidence; build work is
    tracked in the build ticket. Close it with `gh issue close <n> --reason completed`
    ([tickets](../../../docs/tickets.md#closing)).
    _Done when_ `gh issue view <n> --json state` reads `CLOSED`.
