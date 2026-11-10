---
name: design-ticket
description: Run a Meddies design ticket from directions to an approved hand-off. Use for a design ticket, design directions, lab frames, a comparison page, design approval, or rewriting a build ticket to cite approved frames.
user-invocable: true
---

A design ticket ends with approved lab frames and a build ticket that cites them by frame ID.
`meddies-design` is the visual reference; this skill is the process. Lab rules (registry
imports, fixtures, stable ids) live in [docs/design/README.md](../../../docs/design/README.md#design-lab).
Precedents: FE-764 and FE-767 (design tickets), FE-769 (build ticket citing frames).

Write `<n>` for the design ticket's number, such as `767`.

## Steps

1. **Map states.** Read the ticket, [DESIGN.md](../../../DESIGN.md), [PRODUCT.md](../../../PRODUCT.md),
   [docs/copy.md](../../../docs/copy.md) and the lab rules. List every screen and state the
   ticket's rules and criteria name, plus the approved frames to reuse.
   _Done when_ each criterion maps to at least one listed state.

2. **Build three directions.** Each direction is a set of lab frames from production
   components: `<n>-a1…`, `<n>-b1…`, `<n>-c1…`. States every direction shares (saving,
   errors, saved) are `<n>-s1…`. Put the frames in `src/features/design-lab/<topic>-frames.tsx`
   and spread them into `designFrames`; example data goes in `lab-fixtures.ts`.
   _Done when_ every listed state has a frame in each direction (or in `-s*`), and
   `pnpm exec vitest run --project integration tests/design-lab-http.test.ts` passes.

3. **Capture.** Stop `pnpm dev`, then run `pnpm lab:capture <n>-`. It writes
   `<slug>-402x874.png`, `<slug>-320x740.png` and `<slug>.json` per frame and prints the
   folder. Open every 402x874 PNG and fix what looks wrong.
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

6. **Remove the losing directions.** Delete their frames and any lab-only parts only they
   used. Republish the page to the same URL as the approved record: approved direction,
   shared frames, decisions, open questions for the build ticket.
   _Done when_ `rg -n '<n>-[bc][0-9]' src tests` (adjust letters to the losers) finds nothing
   and the HTTP test from step 2 passes.

7. **Commit.** Follow [docs/commits.md](../../../docs/commits.md); run `pnpm verify:local`
   first. _Done when_ the commit exists and verify passed.

8. **Post the approval comment** on the design ticket from
   [templates/approval-comment.md](templates/approval-comment.md). Upload each 402x874 PNG
   with `linearis files upload <png>` and embed the returned URLs.
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
    their own ticket (FE-769's Start date gap came from one).
    _Done when_ every need is met by the contract, cited by a backend ticket criterion,
    or dropped by Bora.

11. **Rewrite the build ticket** from [templates/build-ticket.md](templates/build-ticket.md):
    rules grouped by frame, open questions turned into decisions or named owners, and every
    criterion citing frame IDs as `767·A3`.
    _Done when_ the read-back build ticket has no criterion without a frame ID and no
    reference to "the approved frames" without IDs.
