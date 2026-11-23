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

- Discover unknown file paths with `rg --files`; read cited sections with `rg` and bounded
  line ranges. Do not concatenate documentation files. Read complete source files only
  when necessary to
  understand or modify them; never reread unchanged content already in context, this
  skill included.
- Batch independent read-only inspections when useful, but cap their combined output.
- Scope large diffs by file or hunk so each read stays bounded.
- Send verbose command output to a temp file (`log=$(mktemp)`); read only failures and
  the final summary.
- Run the smallest relevant check while iterating.
- Preflight environment requirements once before implementation when the issue needs
  local servers, browser tests, or external services.
- On `EPERM`, `EACCES`, blocked port binding, or sandbox denial, request escalation once
  if supported. Otherwise record the blocker and stop the affected verification. Never
  retry an unchanged blocked command or modify application code to work around the
  execution environment. Never ship or close with required verification blocked.
- For long-running commands, use a reasonable initial wait and subsequent waits of
  10-30 seconds instead of polling every second. Do independent work while a command
  runs when safe; do not poll until its result is needed.
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

2. **Check the size.** Before reading docs or code, count the issue against the
   [size limits](../../../docs/tickets.md#size), from its Size line or from its body. Over a
   limit, or a scope that will not fit the stated budget: stop, propose a split by layer,
   and ask. On approval, rewrite the issue to the slice you will build and create the
   follow-up ticket per [changing scope](../../../docs/tickets.md#changing-scope).
   _Done when_ the issue is within every limit, or the user approved building it as it is.

3. **Find the owner and its rules.** Start from the approved scope. First locate the owning
   code: the files the issue's Ownership or Current state names, else find them with `rg`,
   and read them. Then open the sections that govern it: every spec section, rule and design
   frame the issue cites, plus the [AGENTS.md](../../../AGENTS.md#docs) row sections that
   apply to the owner (authorization, layers, schema changes, saves and retries). Open
   sections, not whole docs.
   _Done when_ the owner is read and each acceptance criterion maps to the rule or frame
   that governs it.

4. **Name the proof.** Each acceptance criterion names its evidence: an existing test, a
   new test where [one is required](../../../docs/verification.md#when-a-test-is-required),
   or a visual or manual check. A required test goes at the
   [cheapest level](../../../docs/verification.md#cheapest-proof) and names the regression it
   catches. Note any required preflight, test-first test or `before` capture. Ask the user
   only when an ambiguity changes scope; otherwise pick the reading that matches the cited
   spec and name it in the evidence.
   _Done when_ every criterion names its evidence. Start building now. A further read
   answers a named implementation or verification question; open the rest of verification,
   commit rules and closing steps at the step that runs them.

5. **Build.** For UI work, first follow [UI build routing](#ui-build-routing).
   Test-first only for the new tests step 4 requires (use the `tdd` skill).
   While iterating, run `pnpm test:related <changed files>`, `pnpm typecheck` and
   `pnpm exec eslint <changed JS/TS files>` as relevant; check changed-file lint before
   broad verification. Work that touches a design-critical screen follows
   [built frames](../../../docs/design/README.md#built-frames): a design's build ticket
   moves its frames for design-critical screens to `built/` and deletes the rest, and a
   screen change updates its [outline](../../../docs/design/README.md#outlines).
   A significant visual change runs `pnpm lab:capture` for those frames before building
   and again after. For visual checks, first use the existing
   [capture commands](../../../docs/design/README.md#capture),
   [screen captures](../../../tests/browser/README.md#screen-captures) and relevant browser
   fixtures. Extend an opt-in visual case when interaction coverage is missing; use an
   ad-hoc browser session only for checks the existing infrastructure cannot cover.
   _Done when_ relevant tests and changed-file lint pass, and every changed outline and
   capture is reviewed.

6. **Review.** Read `git diff $base` against two axes: the standards in AGENTS.md and the
   docs from step 3, and each acceptance criterion. Fix what you accept.
   _Done when_ every criterion points to code plus its named evidence, and every finding
   is fixed or rejected with a one-line reason.

7. **Verify.** Start broad verification only after implementation, tests, captures,
   outlines, review fixes and targeted checks are complete, with no changes ongoing.
   For code changes, run `pnpm verify:local >"$log" 2>&1` once, then read the
   summary. On failure, fix the cause, rerun only the failed cases until they pass, then
   run `pnpm verify:local` once more. For docs-only changes, run `pnpm format:check` instead.
   An environment blocker is not a passing result; stop before shipping if required
   verification cannot complete.
   _Done when_ the required final verification exits 0 on the final code or docs.

8. **Ship.** Commit per [commits](../../../docs/commits.md) and push to main. Tick each
   criterion box in the issue body (`gh issue edit <n> --body-file`), post the
   [evidence](../../../docs/verification.md#evidence) comment, read both back, then close
   per [tickets](../../../docs/tickets.md#closing). Attach reviewed screenshots with
   `gh issue comment --attach` when visual checks are evidence, and read back their links.
   Close without waiting for Release.
   _Done when_ the read-back shows every box ticked, the evidence comment cites the pushed
   commit and includes any required screenshot attachments, and the issue is closed.

## UI build routing

- **Approved frames:** build the cited frame IDs, exact copy and acceptance criteria from
  the existing production components and approved lab parts. Use those as the brief for
  supporting skills and review; keep exploration within the implementation needed to meet
  them. Select supporting references for the actual surface and change; keep optional
  redesign and alternative-direction exploration outside a prescribed build.
- **Unresolved design:** if the frames and rules leave a design decision open, stop the
  affected build and ask, proposing a design ticket through
  [design-ticket](../design-ticket/SKILL.md). Resume when its approved hand-off resolves the
  decision; the build does not choose a new direction itself.
- **Supporting guidance:** apply the available skills' triggers and mandatory instructions.
  For UI implementation, use `impeccable` with the approved brief and target surface; for
  shadcn components, use `shadcn` for the relevant component APIs and composition rules.
  Read each applicable skill once, then reach only references required by that skill or
  the concrete implementation question. Reuse loaded project context and references;
  complete any mandatory setup, context loading and reference reads even when they overlap
  repo docs. This routing narrows optional exploration, never higher-priority requirements.

Report: what changed, what failed, what's next.
