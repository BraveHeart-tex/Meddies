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
- **Precedence:** `110` overrides the earlier designs where they conflict. Mocks show layout,
  not chrome: build with the production AppShell, components and tokens, and take geometry
  from [DESIGN.md](../../DESIGN.md).
- **Wording:** [docs/copy.md](../copy.md) overrides the wording in these snapshots.

Keep committed snapshots and captures synthetic: use example addresses and role names
for approval notes. Keep personal approval attribution in the linked GitHub issue evidence.

## Design lab

Use the lab for new frames that should hand off as real production components. Run
`pnpm dev`, then open `/lab` for the registry or `/lab/109-l1` for cold launch `109·L1`.
The lab exists only under `next dev`; production and preview builds return the themed
HTTP 404. Existing HTML snapshots above remain supported.

`src/features/design-lab/frames.tsx` is the typed registry: each lowercase
`<design>-<frame>` slug owns its title, citation and render function. Routes only adapt
and compose. Import production compositions; reusable UI belongs in shared UI, layout
or feature modules from day one. The initial frame imports the root loading composition,
including its AppShell exactly once.

Synthetic fixtures must be typed against feature contracts and seeded into a per-frame
Query client, with no data network reads. Cold launch needs no data wrapper. The first
data-driven frame's owner implements that wrapper.

Lab rules that the checks enforce or that bit before:

- **Registry imports stay hook-free.** `frames.tsx` is a server module, so frame files it
  imports render client screens marked `'use client'` and hold no hooks themselves. The
  lab HTTP test renders every registered frame, so a break fails `pnpm verify:local`.
- **Shared example data lives in `lab-fixtures.ts`**, typed against feature contracts, so
  frames show the same medicine, clock and schedules.
- **Server-rendered ids are stable.** Frames render on the server first, so ids come from
  fixtures or `useId`, never from random values such as `useFieldArray`'s row ids, which
  break hydration.

Capture frames for review by slug prefix, with `pnpm dev` stopped:

```sh
pnpm lab:capture 215-            # or --out <dir>; prints the capture folder
```

It writes `<slug>-402x874.png` (screen-size), `<slug>-320x740.png` and `<slug>.json` per
frame, hides the Next dev overlay, and exits non-zero on horizontal overflow or a console
error. The design-ticket skill (`.agents/skills/design-ticket/`) runs the full process.
The deeper `109·L1` shell geometry check stays opt-in:
`MEDDIES_BROWSER_DEV=1 MEDDIES_VISUAL_OUT=/tmp/meddies-lab pnpm exec playwright test design-lab-capture --project=phone --grep=@visual`.
Choose additional
checks by risk under [verification](../verification.md#visual-verification).

Attach screenshots to the owning GitHub issue with `gh issue comment <n> --attach <png>`
(images and video only; link JSON from the CI run or paste it in a collapsed block), record
design review and approval there, and link the same evidence in the implementation handoff. Commit no binary artifacts.
