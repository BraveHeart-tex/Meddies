# Meddies design system

Cozy Care is the approved visual direction for Meddies. The app should feel warm, calm, and dependable. Wording follows [docs/copy.md](docs/copy.md).

## Foundations

- **Color:** cream canvas, flat white cards, and cocoa text. Berry is for primary actions. Blush is for selected surfaces, the next-dose hero, and the sign-in welcome. Use the Tailwind semantic roles in [the global theme](src/global.css). Pale card borders are decorative; controls use the stronger input border and solid focus ring. This is a light theme.
- **Type:** Nunito is served through Next.js. Use the theme's type roles (`text-display`, `text-title`, `text-heading`, `text-body-lg`, `text-body-sm`, `text-caption`, `text-label`, `text-micro`), heavy headings and action labels, readable supporting text, and tabular numerals. Show the actual date when it differs from the scheduled date; formats follow [copy](docs/copy.md#dates-and-times).
- **Spacing:** start with 20px page and section spacing, 10px list gaps, and 16px card padding. Use the theme's larger radii for cards, the hero, and the drawer. Reserve shadows for floating surfaces.
- **Reach:** let text wrap and layout grow. Targets, focus, safe areas and motion follow the [accessibility safeguards](PRODUCT.md#accessibility--inclusion).

## Components

- Build with the shadcn components in `src/components/ui` (Base UI primitives), themed to Cozy Care through their variants: Button, Drawer, Card, Item, Badge, ToggleGroup, Field, Input, Select, DatePicker (Popover + Calendar), TimePicker (hour and minute Selects), Alert, Toast. They cover every drawer, select, option set and status pill; dates and times always use DatePicker and TimePicker, never native date or time inputs.
- Use real route links for navigation.
- The bottom bar holds four tabs: Today, Medications, History and Settings (sliders icon), and the current page's tab is selected. Tabs share the bar's width equally but never shrink below their label, so _Medications_ stays whole at 320px (`238·A1`-`A5`).
- Page headers carry only page actions beside the title, never Settings; a title-only header stands alone with no spacer. A Medication sub-screen's row is its Back link alone.

## Icons

- Import every UI icon directly from `lucide-react` and pass the component, never a glyph-name string.
- Containers own icon sizes; Button icons use `data-icon`. Center icon-and-label groups with symmetric horizontal padding.
- One global `.lucide` rule sets stroke width to 2.5, and icons inherit `currentColor`.
- Medication identity tiles keep their brand shapes and stay decorative.

## Forms

- Forms follow the [form conventions](docs/forms.md), with Add medicine as the reference.
- Show each error under its control, above its help text, after the first submit; focus the first invalid control.
- Choices of two or three short options are a ToggleGroup, with nothing preselected when a wrong default could be saved. An option set expected to grow past three is a Select row, also with nothing preselected; Add medicine's Type is the reference.
- Use one Alert above one full-width primary action. While the device is known offline, the primary reads _Connect to save_ (disabled) and an Alert says the entered values stay for this session.

## Drawers

- Use Drawer for every slide-in panel: a content-sized bottom drawer on phone and desktop, capped at a readable width, without snap points. Keep its swipe handle and Cozy Care scrim, radius, and safe-area padding.
- Swiping, Close, backdrop press, and Escape dismiss it and discard unsaved input. While a save is pending, all of them are refused and Close is disabled.
- Add medicine is this Drawer over Medications, built like the Settings inset list (`193·B·Drawer`).
- The record drawer asks _What happened?_ with an explicit outcome choice and saves nothing until the user saves. Taken offers _Now_, the scheduled time once it has passed, or _Other_ date and time, plus an amount. Skipped confirms the skip and records no intake time or quantity.

## Dose status and confirmation

- Distinguish _Scheduled_, _Due now_, _Not logged_, _Taken_, and _Skipped_ with text and icon. Keep scheduled time separate from actual intake and from skip confirmation.
- Keep explicit confirmation, progress, retries, correction, and stale-state handling. Use a factual success announcement after the server confirms the save; `toast.add({ title, type })` shows it.
- Dose outcomes have no Undo (108·F2): correct them through the dose drawer.

## Empty states

- Use `EmptyState` (`200·B`) only after the read finishes; a failed read stays an Alert. Each answers what's here, why, and what to do next.
- Geometry: a centred column with an 88px, 26px-radius muted tile and a 36px decorative Lucide icon, a `text-title` heavy heading, `text-body-lg` muted body, and an optional full-width `lg` primary action. Gaps are 40px below whatever sits above it (the parent's 20px plus the component's 20px), 20px tile to title, 8px title to body, 20px body to action.
- Never use a check icon, because a check means Taken.
- Allow at most one primary action per view: while the list is known to be empty, the header Add uses the soft Button variant.
- A not-found screen is recovery, not an empty state: use an Alert above an outline link, like the app 404.

## Screens

- **Sign-in** is a blush screen with the logo and wordmark above a cream bottom sheet; this replaces `109·S1`.
- **Settings** is an inset list: eyebrow-headed white groups with one icon-tiled row per fact, then the sign-out button below; this replaces `109·G1`.

## Loading and saving

- Show headings, navigation, and data-independent controls immediately. Use a skeleton only for a section with no usable data, never while refreshing or saving content already shown.
- Match the loaded layout so nothing shifts when content arrives: same widths, radii, gaps, and minimum heights. Today shows the hero (28px radius) and three rows of 64px minimum height with 10px gaps. Medications shows four 76px rows. History shows the 46px date field and three rows. Use fixed placeholder counts; never size skeletons from guessed list lengths.
- Fill skeletons with the sunken surface (the hero uses blush). Skeletons are static: no shimmer or pulse at any motion setting. Mark skeletons `aria-hidden` and give each loading section one polite `role="status"` label, such as _Loading Today_. Don't announce individual placeholders or background refreshes.
- Route skeletons compose the shared `Skeleton` and `LoadingSection` primitives; Today's composition is shared with the cold launch. The cold launch (`109·L1`, the root loading fallback) is the reference: shell and its four tabs, header skeleton bars with no Settings button, Today's skeleton and one _Opening Meddies_ status.
- Refreshing keeps content and shows progress only on the refresh control. A failed refresh keeps content and adds a recoverable alert.
- Saving disables the form and gives the primary action a saving label. Dose recording and correction show the chosen outcome on affected rows as a pending outline badge until the server confirms; setup and schedule edits never show optimistic state.
- A definite failure clears only that save's pending state, keeps the entered values, and shows an alert above the primary action. An unconfirmed save keeps the values and turns the primary action into a retry of the same attempt. A conflict applies nothing and offers a way to review what is saved now.
- Wording for these states follows [copy](docs/copy.md#errors).
- Pending saves and their failures stay visible after navigating away.

## Reference screens

Use synthetic data in production routes. Review Today with a next occurrence and unresolved doses, Medications with and without schedules, and the dose drawer for record and review. Check History for cross-date intake, first-schedule setup for validation, and signed-out and unavailable states for recovery. These are reference scenarios, not a checklist for every change; which screens and checks a change needs follows the [verification guide](docs/verification.md#visual-verification).

The Cozy Care export in `.agents/skills/meddies-design/` supplies the visual source; this file and `src/global.css` win where they differ. Interactions follow the [UX and dose-state boundaries](docs/product/ux-journeys.md#approved-ux-and-dose-state-boundaries) and the [dose logging contract](docs/product/medication-domain.md#domain-and-dose-logging---approved-contract).
