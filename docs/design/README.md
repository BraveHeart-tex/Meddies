# Design lab

Design references are executable lab frames built from production components. Rules live in
[DESIGN.md](../../DESIGN.md), wording in [copy](../copy.md), tokens in `src/global.css`, and
behavior in the [product docs](../product/README.md); a frame shows them, it never adds behavior.
Run `pnpm dev`, then open `/lab` for the registry or `/lab/109-l1` for cold launch `109·L1`. The
lab exists only under `next dev`; production and preview builds return the themed HTTP 404.

Standalone HTML is for temporary exploration only, such as the design ticket's comparison page,
and is never committed as a reference. Keep committed frames and captures synthetic: use example
addresses and role names, and keep personal approval attribution in the GitHub issue evidence.

## Finding a design

- **By route or screen:** the [built frames](#built-frames) table maps each design-critical screen
  to its frame.
- **By component:** `rg -n "<Component>" src/features/design-lab` lists the frames that render it.
- **By ticket:** `rg -n "citation: '241·" src/features/design-lab` lists a design's frames; an
  archived design's frames are in its ticket's "Approved design" table.
- **By ID:** search the literal citation, such as `rg -n "241·A5" src/features/design-lab`.

## Lifecycle folders

A frame's status is its folder under `src/features/design-lab/`:

| Folder      | Holds                                                                   | Leaves when                                  |
| ----------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| `draft/`    | A design ticket's directions                                            | Approval: the winner moves, the rest go      |
| `approved/` | Approved designs waiting for their build ticket                         | The build ticket moves or deletes each frame |
| `built/`    | **Built frames:** design-critical screens rendered from production code | A redesign's build ticket replaces it        |

Each folder's `frames.tsx` lists its frames, and the registry `frames.tsx` stamps their
status, so no frame states its own. Only built frames carry a `route`; a `route` on a draft
or approved frame is a type error. A design's modules (`<topic>-frames.tsx`, `-parts`,
`-screens`, `-drawers`, `-model`) live in its frames' folder and move or go with them.

An **archived design** has no frames left in the registry. Its citations stay valid and
resolve through its design ticket's "Approved design" table and approval comment, and its
frames stay in git history. Citations of the deleted snapshot designs 106, 107, 108, 110 and 200
are not allowed; 109 and 193 keep only their registered frames.

## Citations

`241·A5` is frame `A5` of design ticket #241. A frame's slug is its citation lowercased with
`·` as `-`: `193·B·Scanner` is `/lab/193-b-scanner`. Write every slug and citation out
literally, never from a template, so `rg` finds them. While a design has frames in the
registry, every citation of it in `src`, `tests`, `docs`, `.agents`, `DESIGN.md`,
`PRODUCT.md` and `AGENTS.md` must be a registered frame. `tests/design-citations.test.ts`
enforces this in `pnpm verify:local`.

## Rules

Routes only adapt and compose. Import production compositions; reusable UI belongs in shared
UI, layout or feature modules from day one. Synthetic fixtures must be typed against feature
contracts and seeded into a per-frame Query client, with no data network reads.

- **Built frames render production code only.** They may import production components,
  `@/components/ui/**`, layout and feature modules, `lab-fixtures.ts`, `fixture-query.tsx` and
  `*-model` values, never `draft/`, `approved/` or lab `-parts`, `-screens` and `-drawers`
  modules, and put no `className` on lowercase elements. Lint fails `built/**` files that break
  this.
- **Registry imports stay hook-free.** The `frames.tsx` files are server modules, so frame
  files they import render client screens marked `'use client'` and hold no hooks
  themselves. `meddies/lab-client-imports` catches a break statically, and `pnpm lab:capture`
  renders frames under `next dev`.
- **Frame files take only components from client modules.** Plain values a frame needs live in
  `<topic>-model.ts`; `meddies/lab-client-imports` fails a frame file that imports anything else
  from a `'use client'` module.
- **Shared example data lives in `lab-fixtures.ts`**, typed against feature contracts, so
  frames show the same medicine, clock and schedule. Data only one design uses lives in its
  `<topic>-model.ts`.
- **Server-rendered ids are stable.** Frames render on the server first, so ids come from
  fixtures or `useId`, never from random values such as `useFieldArray`'s row ids, which
  break hydration.

## Built frames

A **built frame** renders a **design-critical screen** from production code, so the lab shows
what ships. Each design-critical screen has exactly one built frame, titled by the screen
(`designCriticalScreens` in the registry `frames.tsx`). The Scanner joins the list once it has a
route.

| Screen            | Frame    | Route                        |
| ----------------- | -------- | ---------------------------- |
| Today             | `238·A1` | `/`                          |
| Medications       | `238·A2` | `/medications`               |
| Medication detail | `238·A3` | `/medications?medicine=<id>` |
| History           | `238·A4` | `/history`                   |
| Settings          | `238·A5` | `/settings`                  |
| Cold launch       | `109·L1` | `/`                          |

- A built frame composes what its page renders, with the page's server reads replaced by
  fixtures seeded into `FixtureQuery` (`fixture-query.tsx`). Seeded data never goes stale and
  nothing reads the network. The shared data is `routine` in `lab-fixtures.ts`.
- When a page can't render from seeded data alone, the frame renders the production child its
  view selects: Medication detail renders `MedicinePanel`, because the lab URL carries no
  Medications view. Styled markup a frame needs moves out of the page into a production
  component, such as `ScreenStack` and `SettingsScreen`. Production code takes props for its own
  callers only.
- A design's build ticket moves its frames for design-critical screens to `built/` and deletes
  the rest. A redesign's build ticket replaces the built frame in place.

## Outlines

`tests/built-frames.test.tsx` renders every built frame and compares its text outline (roles,
accessible names, states and text; no classes) with `tests/outlines/<slug>.txt`. It goes red on
a copy or structure change in a production screen, never on visual drift. After an intended
change, review the outline diff, then update it:

```sh
pnpm exec vitest run tests/built-frames.test.tsx -u
```

The same test checks that each design-critical screen has exactly one built frame and that no
built frame reads the network.

## Capture

Capture frames for review by slug prefix, with `pnpm dev` stopped:

```sh
pnpm lab:capture 241-            # or --out <dir>; prints the capture folder
```

It writes `<slug>-402x874.png` (screen-size), `<slug>-320x740.png` and `<slug>.json` per
frame, hides the Next dev overlay, and exits non-zero on horizontal overflow or a console
error. The design-ticket skill (`.agents/skills/design-ticket/`) runs the full process,
including attaching captures to the issue. Choose additional checks by risk under
[verification](../verification.md#visual-verification). The deeper `109·L1` shell geometry
check stays opt-in:

```sh
MEDDIES_BROWSER_DEV=1 MEDDIES_VISUAL_OUT=/tmp/meddies-lab pnpm exec playwright test design-lab-capture --project=phone --grep=@visual
```

A significant visual change to a design-critical screen (layout, spacing, type, color or
control placement) gets a capture review: capture its built frames before building and again
after, compare the PNGs yourself, fix unintended drift, and attach both sets to the evidence
with every remaining difference named. Outlines cover copy and structure, not this.

`gh issue comment --attach` takes images and video only; link JSON from the CI run or paste
it in a collapsed block. Commit no binary artifacts.
