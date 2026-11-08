# Approved design snapshots

Read-only copies of the approved Cozy Care journey designs, so frames can be searched
locally. The live artifact linked at the top of each file is where reviews and comments
happen. After a design changes there, refresh the copy here.

| File                                                       | Design                                    | Frames                                                    |
| ---------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| [fe-646-screen-map.html](fe-646-screen-map.html)           | FE-646 screen and control map, D1 to D6   | Flow map, inventory, pattern mocks (screenshots stripped) |
| [fe-647-medications.html](fe-647-medications.html)         | FE-647 Medications journey, D7 to D9      | A, B, M, S, L, D                                          |
| [fe-648-daily-routine.html](fe-648-daily-routine.html)     | FE-648 Today, drawer, History, D10 to D14 | W, T, R, E, F, C, H                                       |
| [fe-649-access-recovery.html](fe-649-access-recovery.html) | FE-649 access and recovery, D15 to D19    | A, X, S, G, L                                             |
| [fe-650-routine-handoff.html](fe-650-routine-handoff.html) | FE-650 cross-journey review, D20 to D23   | Corrections (Fix 1 to 6), coverage, owner handoff         |

- **Citations:** frame IDs repeat across designs, so cite them with the ticket number:
  `649·L1` is frame `L1` in the FE-649 file.
- **Finding a frame:** frames in the FE-647 to FE-649 files are keyed by ID in the script.
  Search the file instead of reading it whole: `rg -n "^\s+L1:" docs/design/fe-649-access-recovery.html`.
- **Precedence:** FE-650 overrides the earlier designs where they conflict. Mocks show layout,
  not chrome: build with the production AppShell, components and tokens, and take geometry
  from [DESIGN.md](../../DESIGN.md).
- **Wording:** [docs/copy.md](../copy.md) overrides the wording in these snapshots.
