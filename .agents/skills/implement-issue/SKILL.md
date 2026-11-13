---
name: implement-issue
description: Implement one Meddies GitHub issue end to end, from reading it to the closing evidence comment.
disable-model-invocation: true
---

Implement the GitHub issue the user passed with the invocation (a URL or `#n`). No issue
given: ask for one. Done is the [AGENTS.md](../../../AGENTS.md) definition: `pnpm
verify:local` green, every criterion ticked, pushed to main, evidence posted, issue closed.

Work **lean** throughout:

- Read each doc once: the matching section by heading or `rg`, never whole-file bundles.
- Send verbose command output to a temp file (`log=$(mktemp)`); read only failures and the
  final summary.
- Run the smallest relevant check while iterating; broad verification runs once, at the end.
- One review, done by you. Spawn parallel reviewers or subagents only when the user asks.

## Steps

1. **Load the issue.** Run the read commands in
   [tickets](../../../docs/tickets.md#selecting-work): body, comments, parent, blockers.
   Record the review baseline: `base=$(git rev-parse HEAD)`. Set Project Status to In
   progress. State the issue title.
   _Done when_ the title is stated, `base` is recorded and every blocker is closed. An open
   blocker stops the run: report it and ask. A design ticket (title starting `Design:`)
   leaves this skill here and runs the `design-ticket` skill instead; its approval comment
   is the evidence.

2. **Read the docs.** Pick the rows of the AGENTS.md docs table the work touches, plus every
   spec section and design frame the issue cites.
   _Done when_ each acceptance criterion maps to the rule or frame that governs it.

3. **Set test seams.** The seams are the acceptance criteria, each proven at the
   [cheapest level](../../../docs/verification.md#cheapest-proof). Ask the user only when an
   ambiguity changes scope; otherwise pick the reading that matches the cited spec and
   name it in the evidence.
   _Done when_ every criterion has a named test or check.

4. **Build.** Test-first at those seams (use the `tdd` skill). Iterate on
   `pnpm test:related <changed files>` and `pnpm typecheck`. Work that touches a
   design-critical screen follows [built frames](../../../docs/design/README.md#built-frames):
   a design's build ticket moves its frames for design-critical screens to `built/` and
   deletes the rest, and a screen change updates its [outline](../../../docs/design/README.md#outlines).
   A significant visual change runs `pnpm lab:capture` for those frames before building and
   again after.
   _Done when_ every seam's test passes, and every changed outline and capture is reviewed.

5. **Review.** Read `git diff $base` against two axes: the standards in AGENTS.md and the
   docs from step 2, and each acceptance criterion. Fix what you accept.
   _Done when_ every criterion points to code plus a passing test, and every finding is
   fixed or rejected with a one-line reason.

6. **Verify.** `pnpm verify:local >"$log" 2>&1`, then read the summary. On failure, fix,
   rerun the failed cases alone until they pass, then rerun `pnpm verify:local`.
   _Done when_ `pnpm verify:local` exits 0 on the final code.

7. **Ship.** Commit per [commits](../../../docs/commits.md) and push to main. Tick each
   criterion box in the issue body (`gh issue edit <n> --body-file`), post the
   [evidence](../../../docs/verification.md#evidence) comment, read both back, then close
   per [tickets](../../../docs/tickets.md#closing). Close without waiting for Release.
   _Done when_ the read-back shows every box ticked, the evidence comment cites the pushed
   commit, and the issue is closed.

Report: what changed, what failed, what's next.
