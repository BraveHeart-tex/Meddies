# Approved design snapshots

Read-only copies of the approved Cozy Care journey designs, so frames can be searched
locally. The live artifact linked at the top of each file is where reviews and comments
happen. After a design changes there, refresh the copy here.

| File                                                 | Design                                  | Frames                                                              |
| ---------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| [106-screen-map.html](106-screen-map.html)           | #106 screen and control map, D1 to D6   | Flow map, inventory, pattern mocks (screenshots stripped)           |
| [107-medications.html](107-medications.html)         | #107 Medications journey, D7 to D9      | A, B, M, S, L, D                                                    |
| [108-daily-routine.html](108-daily-routine.html)     | #108 Today, drawer, History, D10 to D14 | W, T, R, E, F, C, H                                                 |
| [109-access-recovery.html](109-access-recovery.html) | #109 access and recovery, D15 to D19    | A, X, S, G, L                                                       |
| [110-routine-handoff.html](110-routine-handoff.html) | #110 cross-journey review, D20 to D23   | Corrections (Fix 1 to 6), coverage, owner handoff                   |
| [193-add-flow.html](193-add-flow.html)               | #193 Add medication, direction B chosen | B·Drawer, B·Scanner, B·Barcode read, B·No match, B·More types       |
| [200-empty-states.html](200-empty-states.html)       | #200 empty states, option B chosen      | B·Medications Start, B·Today Finish, B·Today Clear, B·History Clear |

- **Citations:** frame IDs repeat across designs, so cite them with the design ticket's issue
  number: `109·L1` is frame `L1` in the `109` file.
- **Finding a frame:** frames in the `107` to `109` files are keyed by ID in the script.
  Search the file instead of reading it whole: `rg -n "^\s+L1:" docs/design/109-access-recovery.html`.
  Lab frames are listed with their citations at `/lab` under `pnpm dev`; search one by its
  literal citation: `rg -n "241·A5" src/features/design-lab`.
- **Precedence:** `110` overrides the earlier designs where they conflict. Mocks show layout,
  not chrome: build with the production AppShell, components and tokens, and take geometry
  from [DESIGN.md](../../DESIGN.md).
- **Wording:** [docs/copy.md](../copy.md) overrides the wording in these snapshots.

Keep committed snapshots and captures synthetic: use example addresses and role names
for approval notes. Keep personal approval attribution in the linked GitHub issue evidence.

## Design lab

New designs are lab frames built from real production components, approved in the
design ticket's approval comment; they add no snapshot above. Run `pnpm dev`, then open
`/lab` for the registry or `/lab/109-l1` for cold launch `109·L1`. The lab exists only
under `next dev`; production and preview builds return the themed HTTP 404.

### Lifecycle folders

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
frames stay in git history.

### Citations

`241·A5` is frame `A5` of design ticket #241. A frame's slug is its citation lowercased with
`·` as `-`: `193·B·Scanner` is `/lab/193-b-scanner`. Write every slug and citation out
literally, never from a template, so `rg` finds them. While a design has frames in the
registry, every citation of it in `src`, `tests`, `docs`, `.agents`, `DESIGN.md`,
`PRODUCT.md` and `AGENTS.md` must be a registered frame. `tests/design-citations.test.ts`
enforces this in `pnpm verify:local`.

### Rules

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
  themselves. The lab HTTP test renders every registered frame, so a break fails
  `pnpm verify:local`.
- **Frame files take only components from client modules.** Plain values a frame needs live in
  `<topic>-model.ts`; `meddies/lab-client-imports` fails a frame file that imports anything else
  from a `'use client'` module.
- **Shared example data lives in `lab-fixtures.ts`**, typed against feature contracts, so
  frames show the same medicine, clock and schedule. Data only one design uses lives in its
  `<topic>-model.ts`.
- **Server-rendered ids are stable.** Frames render on the server first, so ids come from
  fixtures or `useId`, never from random values such as `useFieldArray`'s row ids, which
  break hydration.

### Built frames

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

### Outlines

`tests/built-frames.test.tsx` renders every built frame and compares its text outline (roles,
accessible names, states and text; no classes) with `tests/outlines/<slug>.txt`. It goes red on
a copy or structure change in a production screen, never on visual drift. After an intended
change, review the outline diff, then update it:

```sh
pnpm exec vitest run tests/built-frames.test.tsx -u
```

The same test checks that each design-critical screen has exactly one built frame and that no
built frame reads the network.

### Capture

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
