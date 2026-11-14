---
name: implement-issue
description: Implement one Meddies GitHub issue end to end, from reading it to the closing evidence comment.
disable-model-invocation: true
---

Implement the GitHub issue the user passed with the invocation (a URL or `#n`). No issue
given: ask for one. Done is the [AGENTS.md](../../../AGENTS.md) definition: `pnpm
verify:local` green (`pnpm format:check` for a docs-only change), every criterion ticked,
pushed to main, evidence posted, issue closed.

Work **lean** throughout:

- Read each doc once: the matching section by heading or `rg`, never whole-file bundles.
- Send verbose command output to a temp file (`log=$(mktemp)`); read only failures and the
  final summary.
- Run the smallest relevant check while iterating; broad verification runs once, at the end.
- One review, done by you. Spawn parallel reviewers or subagents only when the user asks.

## Steps

1. **Load the issue.** Run `node scripts/start-issue.mjs <n|url>`
   ([tickets](../../../docs/tickets.md#selecting-work)): it prints the issue, its relations
   and the review baseline, and sets Project Status to In progress. Record
   `base=<its base>`. State the issue title.
   _Done when_ the script exits 0, the title is stated and `base` is recorded. A refusal
   (closed issue or open blocker) stops the run: report it and ask. A design ticket
   (`design: true`) leaves this skill here and runs the `design-ticket` skill instead; its
   approval comment is the evidence.

2. **Read the docs.** Pick the rows of the AGENTS.md docs table the work touches, plus every
   spec section and design frame the issue cites.
   _Done when_ each acceptance criterion maps to the rule or frame that governs it.

3. **Name the evidence.** Each acceptance criterion names its evidence: an existing test, a
   new test where [one is required](../../../docs/verification.md#when-a-test-is-required),
   or a visual or manual check. A required test goes at the
   [cheapest level](../../../docs/verification.md#cheapest-proof) and names the regression it
   catches. Ask the user only when an ambiguity changes scope; otherwise pick the reading
   that matches the cited spec and name it in the evidence.
   _Done when_ every criterion names its evidence.

4. **Build.** Test-first only for the new tests step 3 requires (use the `tdd` skill).
   While iterating, run `pnpm test:related <changed files>`, `pnpm typecheck` and
   `pnpm exec eslint <changed JS/TS files>` as relevant; check changed-file lint before
   broad verification. Work that touches a
   design-critical screen follows [built frames](../../../docs/design/README.md#built-frames):
   a design's build ticket moves its frames for design-critical screens to `built/` and
   deletes the rest, and a screen change updates its [outline](../../../docs/design/README.md#outlines).
   A significant visual change runs `pnpm lab:capture` for those frames before building and
   again after. For visual checks, first use the existing
   [capture commands](../../../docs/design/README.md#capture),
   [screen captures](../../../tests/browser/README.md#screen-captures) and relevant browser
   fixtures. Extend an opt-in visual case when interaction coverage is missing; use an
   ad-hoc browser session only for checks the existing infrastructure cannot cover.
   _Done when_ relevant tests and changed-file lint pass, and every changed outline and
   capture is reviewed.

5. **Review.** Read `git diff $base` against two axes: the standards in AGENTS.md and the
   docs from step 2, and each acceptance criterion. Fix what you accept.
   _Done when_ every criterion points to code plus its named evidence, and every finding is
   fixed or rejected with a one-line reason.

6. **Verify.** Run `pnpm verify:local >"$log" 2>&1` once, then read the summary. On
   failure, fix, rerun only the failed cases until they pass, then run `pnpm verify:local`
   once more.
   _Done when_ `pnpm verify:local` exits 0 on the final code.

7. **Ship.** Commit per [commits](../../../docs/commits.md) and push to main. Tick each
   criterion box in the issue body (`gh issue edit <n> --body-file`), post the
   [evidence](../../../docs/verification.md#evidence) comment, read both back, then close
   per [tickets](../../../docs/tickets.md#closing). Attach reviewed screenshots with
   `gh issue comment --attach` when visual checks are evidence, and read back their links.
   Close without waiting for Release.
   _Done when_ the read-back shows every box ticked, the evidence comment cites the pushed
   commit and includes any required screenshot attachments, and the issue is closed.

Report: what changed, what failed, what's next.
