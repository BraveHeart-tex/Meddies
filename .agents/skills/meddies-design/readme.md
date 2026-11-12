# Meddies Design System - "Cozy Care"

**Meddies** is a personal medication reminder and tracking app: a mobile-first PWA, used mostly on iPhone, built for one person to start with.
Mission: **Never miss a dose. Never run out. Feel in control.** Personality: **Cozy. Cheerful. Dependable.**

This reference kit captures **1a Cozy Care**, the direction chosen in the original visual exploration and written brief. For production guidance, see [DESIGN.md](../../../DESIGN.md).

## Index
- `styles.css`: the global entry point (imports only)
- `tokens/`: `fonts.css`, `colors.css`, `typography.css`, `spacing.css` (spacing, radii, shadow, motion, layout), `base.css`
- `components/`: React primitives (`.jsx` + `.d.ts` + `.prompt.md`) plus one `*.card.html` per folder
  - `core/`: Icon, Button, IconButton, StatusBadge, Card
  - `forms/`: OutcomeChoice, ChipGroup, Stepper, TextField, Switch
  - `medication/`: PillTile, NextDoseCard, DoseCard, MedicationRow
  - `navigation/`: AppHeader, BottomNav
  - `overlays/`: Sheet, Toast
  - `ds-loader.js`: helper that lets cards and kits load components (it uses the compiled bundle, or transpiles the source if there is no bundle)
- `guidelines/`: foundation specimen cards (colors, type, spacing, radii, elevation, touch targets, status system, voice, wordmark)
- `ui_kits/meddies-app/`: interactive Today, Medications and Record-dose flow
- `assets/icons/`: historical SVG references
- `assets/logo/`: Two capsules master artwork, full-bleed
- `SKILL.md`: an Agent Skill entry point

**Intentional additions** (these were not in the explored screens):
- **Toast**: the brief asks for elegant confirmation, and a toast does that without a celebration.
- **Switch**: needed for future Settings.
- **Icons**: direct Lucide components in production.
- **Motion tokens**: proposed values; motion was never specified.

---

## CONTENT FUNDAMENTALS
The rules for UI wording are in `docs/copy.md`, which wins where this section differs.

- **Voice:** a calm friend who keeps your pill box tidy. Warm and brief, never clinical, never cutesy.
- **Person:** address her as **you** and by first name in the greeting ("Good afternoon, Mia"). Meddies never says "I". Choices she makes in the sheet use first person: "I took it" / "I skipped it".
- **Casing:** sentence case everywhere ("Today's doses", "Add schedule"). Uppercase is only for small eyebrows ("UP NEXT", "ON A SCHEDULE").
- **Numbers:** 24-hour `HH:MM`, units with a space (`200 mg`, `1000 IU`), quantities spelled out with a unit ("1 tablet", "8 left"). Use a middle dot `·` as the separator.
- **Status words are fixed:** *Taken*, *Not logged*, *Scheduled*, *Skipped*. Never write "Missed" or "Overdue", and never imply intake that wasn't recorded.
- **No guilt, no pressure:** no streaks, no "you forgot", no exclamation marks. Reassure through facts: "After Magnesium, nothing else until this evening."
- **Confirmations say exactly what was saved:** "Magnesium logged · taken at 14:38". Dose outcomes have no Undo; they are changed through the dose drawer.
- **Buttons describe the outcome:** "Save as taken", not "OK".
- **Emoji:** never.

## VISUAL FOUNDATIONS
- **Color:** a warm cream background (`#FBF5EE`) with white cards and a 1px warm border (`#EEDFD4`).
  - Pink plays two roles. Blush (`#F7DCE3`) is the *comfort surface*: the Up next hero, the active nav tab and selected choices. Berry (`#B23A66`) is the *action*: one primary button per view.
  - Ink is cocoa (`#3B2A2F`), never pure black.
  - Status uses sage (taken) and amber (not logged / low stock), always paired with an icon and a word.
  - Each medication gets a soft identity tint (butter, blush, peach, plum, mist).
- **Type:** Nunito only.
  - Weight 800 for titles, buttons and card titles; 600–700 for body and meta.
  - Sizes: 29 / 24 / 19 / 17 / 16 / 15 / 14 / 13 / 12.
  - Tabular numerals throughout.
  - The rounded terminals carry the warmth, so color doesn't have to.
- **Spacing:** 20px screen padding, 10px between cards, 20px between sections, 14–16px card padding. Layouts are generous but realistically dense.
- **Corner radii:** soft and large. 12 for small buttons, 16 for inputs and chips, 18 for buttons, 20 for choice cards, 22 for cards, 28 for the hero, 32 for the sheet. The nav and add buttons are pills.
- **Cards:** flat, white, 1px warm border, no shadow.
  - *Attention* (needs a response) adds a 1.5px blush border.
  - *Incomplete* (no schedule) uses a dashed border.
  - Never use a colored left-border accent.
- **Elevation:** only floating chrome casts a shadow: the bottom nav (`--shadow-float`), the sheet and the toast. Shadows are warm-tinted, soft and low.
- **Backgrounds:** a flat cream fill. No gradients, images, textures, blobs or glassmorphism.
- **Imagery:** none for now. The PillTile identity glyphs (simple shapes on tints) stand in for medication imagery.
- **Motion (proposed):** short and calm, `cubic-bezier(.2,.8,.2,1)`. Durations: 140ms for presses, 220ms for state changes, 320ms for the sheet sliding up and the scrim fading. No bounce, no confetti.
- **Press states:** fills go one step darker (berry → `#9E3159`; white → cream) and the element scales to 0.98.
- **Hover:** none; this is a touch-first app.
- **Focus:** a 3px berry ring at 35% opacity.
- **Transparency:** only the sheet scrim (cocoa at 48%). No blur.
- **Layout:**
  - Status bar is 54px.
  - The floating pill nav sits 30px above the bottom (16px side insets, 68px tall).
  - Scrolling content reserves about 130px at the bottom.
  - Sheets have a 32px top radius and a grab handle.
- **Touch targets:** 44px minimum. Primary buttons are 52px, and the sheet's main button (CTA) is 56px. Chips are 48px.
- **Status grammar:**
  - Taken = sage + check
  - Not logged = amber + dashed ring
  - Scheduled = outline + clock
  - Skipped = cream + slashed ring
  - Low = amber + triangle

  Scheduled time and actual time always appear separately.

## ICONOGRAPHY
- **Lucide** is the production UI icon set. Import directly from `lucide-react` and pass components rather than string names. Use `currentColor` and the global `.lucide { stroke-width: 2.5; }` rule, with no local stroke overrides.
- Containers own sizing. Icons inside shadcn components have no sizing classes unless an approved design requires an exception. Button icons carry `data-icon`.
- Use Check, Clock, Calendar, Plus, Minus, X, TriangleAlert, CircleDotDashed (Not logged), Ban (Skipped), Settings2, CircleDot (Today), Pill (Medications), and List (History).
- The exported `components/`, `assets/icons/`, specimen cards and UI kit are historical visual references, not production icon APIs. Do not copy their custom glyph implementation or name-based icon props into production. Medication identity tiles remain decorative brand shapes.
- Never use emoji or unicode symbols as icons.
- **Logo:** Two capsules (`assets/logo/two-capsules.svg`), a heart made of two capsules on berry. Use it for app icons, favicons and the sign-in screen. Keep its vertical centre seam: overlapping whole capsules read as a check mark, which means Taken. In other app screens, write "Meddies" in Nunito 800 (see `guidelines/wordmark.html`). Do not draw other marks.

## Fonts
The prototype loads Nunito from Google Fonts via `tokens/fonts.css`. The production app bundles Nunito locally in `src/app/fonts/` and serves it through Next.js.
