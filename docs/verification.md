# Verification

## Required checks

```sh
pnpm verify:local
```

Runs lint, format check, typecheck, a Webpack production build and `pnpm test`, in order.
Webpack sidesteps the Turbopack CSS worker's local port requirement in restricted agent
environments; CI and releases use Turbopack. Locally the build is skipped when no build
input changed. Test commands: [tests/README.md](../tests/README.md).

## Cheapest proof

Prove each behavior at the cheapest level that can prove it, with delays and failures
injected through MSW or journey fixtures, never timers in product code.

- **Unit tests** prove logic: parsing, scheduling rules, reducers.
- **[Component tests](../tests/README.md#component-tests)** prove UI states with MSW:
  refresh keeps content, stale or out-of-order responses lose to newer state, focus and
  reconnect refresh, rejection, unconfirmed save and conflict recovery.
- **[Browser journeys](../tests/browser/README.md)** prove what needs a real browser and app:
  streaming order and fallbacks on direct loads and cold navigation, overlapping reads,
  hydration reuse (zero duplicate initial requests), layout stability against the route's
  budget, stale-on-entry, navigation during a save, session end clearing private state,
  and rollover driven by the scheduling clock.

Every change to data-driven UI reviews each applicable state in
[DESIGN.md](../DESIGN.md#loading-and-saving) against the [Next.js rules](nextjs.md). Prove
behavior rather than counting Suspense boundaries.

## Browser journeys

Locally, journeys are opt-in and outside `pnpm verify:local`; CI runs all of them and a
failure blocks Release. Once after implementation, run the journeys the ticket names plus
the specs exercising any route or flow the change edits, in one
`pnpm test:browser:build <names>` run, then `pnpm verify:local`.

- **Budgets:** a route ticket records `result()` from the layout helper at the selected
  widths, sets a layout-shift budget with a justification in the ticket, and asserts
  against it. Request counts are asserted exactly: zero repeated initial reads per path
  after load unless the ticket justifies otherwise.
- **Gate ticket:** a wave of routes ends in a gate ticket (FE-639 for Today and History)
  that owns consolidated loading captures and visual review. Route tickets register their
  routes in `loading-capture.spec.ts` and own behavioral assertions. Route-specific visual
  evidence is needed only for that ticket's acceptance, and the gate links it without
  recapture.

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
- **Physical iPhone:** installed-PWA behavior, safe areas, the software keyboard, touch
  gestures or VoiceOver. Synthetic Chromium does not establish these; outstanding device
  checks stay in their owning issue (FE-616 for iPhone acceptance, FE-602 for integrated
  accessibility review).

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

Record in the active Linear issue: the revision, journeys run (by file), affected states,
checks performed, evidence links and remaining limitations. For streaming work add
streaming order, request counts, layout shift, viewport and project, and whether evidence
is synthetic (Playwright) or from a real iPhone. Link existing evidence rather than
copying it between issues.

Verification is complete when required checks pass, applicable manual checks are
recorded, and any unverified deployment behavior is named in the issue. A failed or
blocked check keeps verification incomplete; record it explicitly.
