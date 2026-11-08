# Verification

## Required checks

```sh
pnpm verify:local
```

Runs lint, format check, typecheck, a Webpack production build and `pnpm test`, in order.
Webpack sidesteps the Turbopack CSS worker's local port requirement in restricted agent
environments; CI and releases use Turbopack. Locally the build is skipped when no build
input changed. Test commands: [tests/README.md](../tests/README.md).

## CI jobs

The Verify workflow runs three jobs in parallel, then an aggregator:

- **`Static`:** lint, format check, typecheck.
- **`Unit`:** production build, then `pnpm test`.
- **`Journeys`:** production build, Worker build, then every journey except `@visual`.
- **`Checks`:** fails unless all three succeeded, so failed, cancelled and skipped jobs all
  fail it. The `Checks` status context stays the same whichever jobs sit behind it.

The build jobs set `CI_SKIP_BUILD_TYPECHECK=1`, so their builds skip the Next.js type check
that `pnpm typecheck` runs in `Static`. Vercel and local builds keep the check.

## Cheapest proof

Prove each behavior at the cheapest level that can prove it, with delays and failures
injected through MSW or journey fixtures, never timers in product code.

- **Unit tests** prove logic: parsing, scheduling rules, reducers.
- **[Component tests](../tests/README.md#component-tests)** prove UI states with MSW:
  refresh keeps content, stale or out-of-order responses lose to newer state, focus and
  reconnect refresh, rejection, unconfirmed save and conflict recovery.
- **[Browser journeys](../tests/browser/README.md)** prove only what needs a real browser
  or the full stack ([which](#browser-journeys)).

Every change to data-driven UI reviews each applicable state in
[DESIGN.md](../DESIGN.md#loading-and-saving) against the [Next.js rules](nextjs.md). Prove
behavior rather than counting Suspense boundaries.

## Browser journeys

Journeys run outside `pnpm verify:local`. CI runs every journey except `@visual`, and a
failure blocks Release.

- **Local runs:** once after implementation, run only the journeys the ticket names plus
  any spec you added or changed, in one `pnpm test:browser:build <names>` run. No smoke
  set, no full suite.
- **Unrelated CI failure:** check whether it also fails on the commit before the change
  ([how](../tests/browser/README.md#running)). If yes, file a `bug` + `needs-triage`
  ticket and do not fix it in scope. If no, the change caused it: fix it.
- **When to write one:** only for behavior that needs a real browser or the full stack:
  navigation during a save, recovery from an unconfirmed save, streaming and hydration,
  session end, and cross-route consistency. Everything else is a unit or component test.
- **Shape:** one scenario per test. Specs that run in CI assert behavior, never pixel
  constants. Add a viewport variant only when behavior differs by width. Request counts
  are asserted exactly: zero repeated initial reads per path after load unless the
  assertion's comment justifies otherwise.
- **Visual journeys** are tagged `@visual`, run only on request with
  `pnpm test:browser:visual`, and are excluded from CI with no scheduled run.

## Visual verification

For meaningful UI changes (visible content, layout, typography, controls, feedback or
motion), inspect the affected screens at 402×874 CSS px, including loading, empty,
populated, validation, saving and recovery states where the change affects them. Add
focused checks by risk:

- **320px:** widths, spacing, wrapping, responsive layout, navigation, drawers, popups or
  action placement. Include long names where they stress the layout.
- **Enlarged text:** typography, labels, dense controls, fixed dimensions or containers
  that may clip text or hide actions. Target 200% and record the setting and method.
  Viewport resizing is not text enlargement; a CSS font-size probe is labelled synthetic.
- **Reduced motion:** animation, transitions, gestures or motion preferences. Verify the
  interaction at normal and reduced motion; stills do not prove motion. Skeletons stay
  static at every setting.
- **Keyboard and focus:** controls, forms, dialogs, popups or navigation.
- **Synthetic vs device:** the `phone` project is Chromium at 402×874 and is never iPhone
  evidence. Device checks (installed-PWA behavior, safe areas, the software keyboard,
  gestures, VoiceOver, resume after suspend with a pending save) are human acceptance in
  FE-616; integrated accessibility review stays in FE-602.

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

## Evidence and completion

Record one evidence comment in the active Linear issue: the commit, the Release run link,
journeys added or changed (by file), visual and manual checks performed, limitations and
outstanding device checks. The assertions are the evidence; do not copy measurements or
results. Link existing evidence rather than copying it between issues.

Verification is complete when `pnpm verify:local` passes, the change is pushed to main,
the Release verify job (journeys included) is green on that commit and linked in the
issue, applicable manual checks are recorded, and any unverified deployment behavior is
named. A failed or blocked check keeps verification incomplete; record it explicitly.
