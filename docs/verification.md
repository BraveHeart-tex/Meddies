# Verification

## Required checks

```sh
pnpm verify:local
```

Runs lint, format check and typecheck in parallel, then, in order, the unit and component
tests plus every tooling suite, the build and the integration tests: run alongside, the build
and integration starve the component tests of CPU. A static-check failure stops before the
second stage; second-stage checks all run and report even when an earlier one fails, except
that a failed build skips integration. Locally, a warning names dev-stack tests skipped because fixed ports were busy.
In CI, each dev-stack case fails if its required fixed ports cannot be bound, so a passing
run proves the lifecycle and cleanup checks executed.
It runs alongside `pnpm dev`. Its typecheck and build stages fail fast while a dev-mode journey,
`pnpm lab:capture` or another build holds the
[generated Next.js files lock](../tests/browser/README.md#running).

Each stage prints `START <stage>` immediately before its action, then `PASS` or `FAIL`
with its elapsed seconds and diagnostic-log path. Static starts may overlap; later stages
start after the preceding stage completes. The final summary keeps each result and elapsed
time. Verbose child stdout and stderr go to one log per stage in the reported temporary
`meddies-verify-logs-*` directory instead of flooding the console. Logs remain after both
success and failure, including build-reuse messages; remove the directory when diagnostics
are no longer needed (the operating system may also clean temporary files).

Observable child termination names the signal and stage, keeps available diagnostics and
fails that stage. Handled runner `SIGINT` and `SIGTERM` name every active interrupted stage,
forward the signal to active child process groups on POSIX (direct children on Windows),
stop launching stages and print a failing summary. Their exit codes are 130 and 143;
ordinary success/failure remains 0/1. A missing test JSON report cannot mask the original
child failure. Uncatchable signals such as `SIGKILL` cannot produce a final report; only
output already written to diagnostic logs can survive. These messages report observed
signals, not why they were sent.

The `tooling` Vitest project (scripts, workflows and the journey harness, listed in
`scripts/tooling-tests.mjs`) runs in every local verification, independent of changed paths
or Git availability. No tooling checks are CI-only or change-selected. The runner prints this
policy, reports the combined test stage and names it as skipped if static checks fail or the
runner is interrupted before tests start. The dev-stack port warning above identifies any skipped cases within a
completed test stage. CI runs every Vitest project, `tooling` included, in parallel with
journeys before Release ([Verify workflow](deployment.md#verify-workflow)).

A change touching only `docs/**` and Markdown runs `pnpm format:check` instead; Release
skips the same paths.

Formatting is written, not reported, wherever it can be. The agent hook
(`scripts/agent-format-hook.mjs`, wired in `.claude/settings.json` and `.codex/hooks.json`)
formats each file an editor tool writes. A local `pnpm verify:local` runs Prettier on
uncommitted files before its format check, covering shell edits; CI only checks.

The verify and journey wrappers reuse a build only when its inputs are unchanged and their
success marker exists, so a hand-run `pnpm build` is always rebuilt.

Validation runs in this order:

1. While iterating, run the unit and component tests that import the changed files, rather
   than a guessed list:

   ```sh
   pnpm test:related src/features/schedules/schedule-setup-form.tsx
   ```

2. Run `pnpm verify:local` once, at the end, on the final code. It is the done gate
   (`pnpm format:check` for a docs-only change).
3. After a failure, fix it and rerun only the failed cases until they pass, then run
   `pnpm verify:local` once more.

Test commands: [tests/README.md](../tests/README.md).

## When a test is required

Add a test when it catches a credible regression, not one per acceptance criterion.

- **A test is required for:**
  - a bug fix, at the lowest level that fails without the fix
  - new logic: scheduling, dates, quantities, parsing
  - a new save or recovery state change
  - a new Worker operation or migration. It gets real-D1 cases for the risks it actually
    introduces, such as retry identity, owner scope, stale revisions, races or existing
    rows, chosen per operation rather than from a fixed matrix.
- **No new test for:**
  - copy, styling or layout
  - a pure move, reviewed with the [unmoved diff](#refactors)
  - design lab frames; `pnpm lab:capture` renders them
    ([design lab rules](design/README.md#rules))
  - behavior an existing test already proves; the evidence cites that test instead

Each test names the regression it catches. A shared primitive is tested once; each feature
that uses it proves its wiring with one case.

Assert behavior, not cosmetic implementation detail: no styling utility classes, sibling
order that only expresses layout, or pixel values outside `@visual`. A class or attribute
assertion stays allowed when it is the behavior's observable signal, such as a state with
no accessible equivalent; `toHaveClass` itself is not banned. Lint fails `toHaveClass` with
a styling utility class in a component test; a real exception is an inline disable stating
the reason.

Every acceptance criterion names its evidence: an existing test, a new test where one is
required, or a [visual](#visual-verification) or [manual](#manual-checks) check. Test-first
applies only where a test is required.

## Cheapest proof

Prove each behavior that needs a test at the cheapest level that can prove it, with delays
and failures injected through MSW or journey fixtures, never timers in product code.

- **Unit tests** prove variations of pure logic as table cases, as in the
  [Schedule](../tests/schedule-save-confirmation.test.ts) and
  [Medicine Add](../tests/medicine-save-confirmation.test.ts) confirmation tests.
- **[Component tests](../tests/README.md#component-tests)** prove UI states with MSW:
  refresh keeps content, stale or out-of-order responses lose to newer state, focus and
  reconnect refresh, rejection, unconfirmed save and conflict recovery. Keep one
  representative case per UI state.
- **Tooling tests** use fixed delays only in cases that prove ordering, as in
  [the verify tests](../tests/verify.test.ts). Poll for readiness at short intervals
  within the script's deadline, as in [the dev stack](../scripts/dev-stack.mjs).
- **[Browser journeys](../tests/browser/README.md)** prove only the
  [allowed reasons](#when-a-journey-is-allowed).

A purely visual fix gets a [visual check](#visual-verification) with no CI test.

Every change to data-driven UI reviews each applicable state in
[DESIGN.md](../DESIGN.md#loading-and-saving) against the [Next.js rules](nextjs.md). Prove
behavior rather than counting Suspense boundaries.

## Browser journeys

Journeys run outside `pnpm verify:local`. CI runs every journey except `@visual`, and a
failure blocks Release. `@visual` journeys run only on request with
`pnpm test:browser:visual`, with no CI or scheduled run.

### When a journey is allowed

A journey is allowed only when it proves one of these reasons. The list is closed: a new
reason changes this rule.

- navigation during a save
- Back, Forward or reload behavior
- streaming or the handoff from server to browser
- session end with real cookies
- real pointer gestures
- data consistency across routes
- focus moved by script after hydration or a route change

These never earn a journey: alignment, spacing, form validation, copy, tap-target size and
width variants. Everything else is proven at a [cheaper level](#cheapest-proof). `@visual`
journeys sit outside this rule.

### Writing a journey

- **Reuse:** add a step to a journey with the same setup before creating a new test.
- **Reason:** each new journey has a one-line comment naming its allowed reason.
- **Shape:** one scenario per test. One page load may carry all its checks, and one test
  may step through several routes for the same behavior.
- **Viewport:** CI runs at 402px unless the allowed behavior itself differs by width.
  Lint fails on a test or describe declared in a loop over widths or viewports; a real
  exception needs an inline disable saying why behavior differs by width.
- **Assertions:** specs that run in CI assert behavior; fixed pixel values belong in
  `@visual`. Request counts are asserted exactly: zero repeated initial reads per path
  after load unless the assertion's comment justifies otherwise.

### Running journeys

CI and local production runs use three workers: after the flake fixes, three was the
fastest count with no failures in the repeated 2/3-worker trial
([#245](https://github.com/BraveHeart-tex/Meddies/issues/245)). Retries stay zero; dev mode
shares the `.next/dev` lock and stays serial. A CI flake reverts the count to the last
clean setting and gets a `bug` + `needs-triage` issue naming the failing specs.

- **Local runs:** once after implementation, run only the journeys the ticket names plus
  any spec you added or changed, in one `pnpm test:browser:build <names>` run. No smoke
  set, no full suite.
- **Unrelated CI failure:** check whether it also fails on the commit before the change
  ([how](../tests/browser/README.md#running)). If yes, file a `bug` + `needs-triage`
  ticket and do not fix it in scope. If no, the change caused it: fix it.

## Visual verification

For meaningful UI changes (visible content, layout, typography, controls, feedback or
motion), inspect the affected screens at 402×874 CSS px with normal text, including loading,
empty, populated, validation, saving and recovery states where the change affects them. Keep
visual captures at this viewport and text size; do not add enlarged-text or alternate-viewport
captures. Capture Today and Medications with the
[screen-capture journey](../tests/browser/README.md#screen-captures);
lab frames use `pnpm lab:capture <slug-prefix>` for one normal-text capture per frame.
Add `--scale 3` for a supplemental high-DPI PNG at the same CSS viewport and text size.
The standard PNG and JSON summary are still written.
Compare against the screen's built frame, and give a significant visual change to a
design-critical screen the
[capture review](design/README.md#capture).

Add focused checks by risk:

- **Reduced motion:** animation, transitions, gestures or motion preferences. Verify the
  interaction at normal and reduced motion; stills do not prove motion.
- **Keyboard and focus:** controls, forms, dialogs, popups or navigation.
- **Synthetic vs device:** the `phone` project is Chromium at 402×874 and is never iPhone
  evidence. Device checks (installed-PWA behavior, safe areas, the software keyboard,
  gestures, VoiceOver, resume after suspend with a pending save) are human acceptance: list
  them as outstanding in the evidence comment. Integrated accessibility review stays in #65.

Pick cases that exercise each relevant risk rather than a viewport × motion × state
matrix. Batch review after implementation, reuse current evidence for unchanged behavior,
and repeat only after relevant fixes. The [PRODUCT.md](../PRODUCT.md) accessibility
safeguards apply whichever checks run.

## Refactors

For a pure-move refactor, review what the move actually changed:

```sh
scripts/unmoved-diff.sh HEAD            # uncommitted; git add -N new files first
scripts/unmoved-diff.sh main...HEAD     # a branch
```

What remains is glue (imports, props, hook returns) and real edits; every non-glue line
needs a reason. Prettier rewraps after indentation changes also remain.

## Manual checks

- Ad-hoc QA: `agent-browser` (`npm i -g agent-browser && agent-browser install`).
- Production smoke: `pnpm start` after building, then exercise the changed flow at
  [localhost:3000](http://localhost:3000).
- Deployed auth changes: [deployment verification](authentication.md#deployment-verification).
- Worker or database deployment changes: verify the changed operation against the
  deployed service and database.

## Evidence

Record one evidence comment in the active GitHub issue: the commit, each acceptance
criterion's evidence (existing test, new test, or visual or manual check), journeys added or
changed (by file), visual and manual checks performed, limitations, unverified deployment
behavior and outstanding device checks. The assertions are the evidence: link them and
existing evidence rather than copying measurements, results or another issue's evidence.
Record a failed or blocked check explicitly; it keeps the work open.
