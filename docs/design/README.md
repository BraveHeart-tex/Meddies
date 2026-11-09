# Approved design snapshots

Read-only copies of the approved Cozy Care journey designs, so frames can be searched
locally. The live artifact linked at the top of each file is where reviews and comments
happen. After a design changes there, refresh the copy here.

| File                                                       | Design                                    | Frames                                                              |
| ---------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| [fe-646-screen-map.html](fe-646-screen-map.html)           | FE-646 screen and control map, D1 to D6   | Flow map, inventory, pattern mocks (screenshots stripped)           |
| [fe-647-medications.html](fe-647-medications.html)         | FE-647 Medications journey, D7 to D9      | A, B, M, S, L, D                                                    |
| [fe-648-daily-routine.html](fe-648-daily-routine.html)     | FE-648 Today, drawer, History, D10 to D14 | W, T, R, E, F, C, H                                                 |
| [fe-649-access-recovery.html](fe-649-access-recovery.html) | FE-649 access and recovery, D15 to D19    | A, X, S, G, L                                                       |
| [fe-650-routine-handoff.html](fe-650-routine-handoff.html) | FE-650 cross-journey review, D20 to D23   | Corrections (Fix 1 to 6), coverage, owner handoff                   |
| [fe-745-add-flow.html](fe-745-add-flow.html)               | FE-745 Add medication, direction B chosen | B·Drawer, B·Scanner, B·Barcode read, B·No match, B·More types       |
| [fe-752-empty-states.html](fe-752-empty-states.html)       | FE-752 empty states, option B chosen      | B·Medications Start, B·Today Finish, B·Today Clear, B·History Clear |

- **Citations:** frame IDs repeat across designs, so cite them with the ticket number:
  `649·L1` is frame `L1` in the FE-649 file.
- **Finding a frame:** frames in the FE-647 to FE-649 files are keyed by ID in the script.
  Search the file instead of reading it whole: `rg -n "^\s+L1:" docs/design/fe-649-access-recovery.html`.
- **Precedence:** FE-650 overrides the earlier designs where they conflict. Mocks show layout,
  not chrome: build with the production AppShell, components and tokens, and take geometry
  from [DESIGN.md](../../DESIGN.md).
- **Wording:** [docs/copy.md](../copy.md) overrides the wording in these snapshots.

## Design lab

Use the lab for new frames that should hand off as real production components. Run
`pnpm dev`, then open `/lab` for the registry or `/lab/649-l1` for cold launch `649·L1`.
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

Capture persistent frames with the shared stylesheet/font readiness, screenshot and
summary measurements:

```sh
MEDDIES_BROWSER_DEV=1 MEDDIES_VISUAL_OUT=/tmp/meddies-lab \
  pnpm exec playwright test design-lab-capture --project=phone --grep=@visual
```

This opt-in visual check uses 402×874 with normal motion, asserts one loading status,
no horizontal overflow and production shell geometry, and writes PNG and JSON evidence.
It neither holds Worker reads nor waits for the persistent status to disappear. Existing
fallback/loaded capture remains available through `loading-capture.spec.ts`. Choose
additional checks by risk under [verification](../verification.md#visual-verification).

Attach screenshots and JSON to the owning Linear issue, record design review and approval
there, and link the same evidence in the implementation handoff. Commit no binary artifacts.
