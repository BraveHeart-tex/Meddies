---
name: implement-issue
description: Implement one Meddies GitHub issue end to end, from reading it to a green PR handed off for merge.
disable-model-invocation: true
---

Implement the GitHub issue the user passed with the invocation (a URL or `#n`). No issue
given: ask for one. Done is the [AGENTS.md](../../../AGENTS.md) definition: a PR to main
with a green `Merge check` on its current head, declaring the issue and carrying evidence for
every criterion, handed off to the maintainer, who reviews and merges. Never push to main or
close the issue yourself; the merge closes it.

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
   and read them. UI work then loads context per [UI build routing](#ui-build-routing).
   Then open the sections that govern it: every spec section, rule and design frame the
   issue cites, plus the [AGENTS.md](../../../AGENTS.md#docs) row sections that
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

7. **Verify locally.** Start only after implementation, tests, captures, outlines, review
   fixes and targeted checks are complete, with no changes ongoing. Run the final local
   checks from [validation order](../../../docs/verification.md#required-checks):
   `pnpm typecheck`, changed-file lint and the issue's required proof; `pnpm format:check`
   alone for docs-only changes. `pnpm verify:local` is for reproducing a Verify failure, not
   a required step. An environment blocker is not a passing result; report blocked required
   proof instead of handing off.
   _Done when_ the final local checks exit 0 on the final code or docs.

8. **Open the PR.** Work on a branch from current `origin/main` (`git switch -c
<n>-<slug> origin/main` before the first commit). Commit per
   [commits](../../../docs/commits.md), push the branch, then write the description per
   [PR descriptions](../../../docs/commits.md#pr-descriptions) to a file:
   `Complete Meddies issue: #<n>` and an `## Evidence` section per
   [evidence](../../../docs/verification.md#evidence) naming the head commit. Run
   `gh pr create --base main --title "<type(#n): subject>" --body-file "$body_file"`, adding
   `--attach <png>` per reviewed screenshot when visual checks are evidence. Read the saved
   body back.
   _Done when_ the PR exists with the declaration and evidence for every criterion.

9. **Hand off green.** Follow [handoff](../../../docs/verification.md#handoff): wait with
   `gh pr checks <n> --watch`; on a failure read the failed job log
   (`gh run view <run> --log-failed`), fix, push and refresh the evidence. When main has
   moved, rebase, push and refresh the head commit in the evidence. Do not merge, do not
   run `finish-issue.mjs`.
   _Done when_ `Merge check` is green on the current head and the evidence names that head.

## UI build routing

- **Brief:** with approved frames, the cited frame IDs and the issue are the brief: build
  their exact copy and criteria from production components and approved lab parts, with no
  alternative directions. A design decision the frames and rules leave open stops that
  build: ask, proposing a design ticket through [design-ticket](../design-ticket/SKILL.md),
  and resume from its approved hand-off.
- **Context once:** name the target file or route, then run each applicable skill's required
  setup once for it (`impeccable`: its `context --target <path>`) before opening UI docs.
  Use what it delivers or directs you to read, once; open nothing it covers again, AGENTS.md
  rows included. Read directly what it omits, and the skill's fallback when setup fails. Run
  setup in its own call, apart from source reads, so a truncated result shows what was cut.
- **Supplements:** each further read answers a named question. Answer component questions
  from the affected code and its `src/components/ui` source; load external skill or API
  guidance (`shadcn`, registry, docs) when that skill's mandatory rules cover the change or
  local code leaves the question open.
- Required skill steps, approval, exact copy, accessibility, security and
  [visual verification](../../../docs/verification.md#visual-verification) baseline and
  final evidence still apply.

Report: the PR link, what changed, what failed, what's next.
