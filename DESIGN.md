# Meddies design system

Cozy Care is the approved visual direction for Meddies. The app should feel warm, calm, and dependable. Use sentence case, short instructions, and factual confirmations. Never imply that someone took a dose unless it was recorded.

## Foundations

- Cream canvas, flat white cards, and cocoa text. Berry is for primary actions. Blush is for selected surfaces and the next-dose hero.
- Use the Tailwind semantic roles in [the global theme](src/global.css). Pale card borders are decorative. Use the stronger input border and solid focus ring on controls. This is a light theme.
- Nunito is served through Next.js. Use the theme's type roles (`text-display`, `text-title`, `text-heading`, `text-body-lg`, `text-body-sm`, `text-caption`, `text-label`, `text-micro`), heavy headings and action labels, readable supporting text, and tabular numerals. Keep times in 24-hour Istanbul time and show the actual date when it differs from the scheduled date.
- Start with 20px page and section spacing, 10px list gaps, and 16px card padding. Use the theme's larger radii for cards, the hero, and the drawer. Reserve shadows for floating surfaces.

## Components and states

- Build with the shadcn components in `src/components/ui` (Base UI primitives) themed to Cozy Care through their variants: Button, Drawer, Card, Item, Badge, ToggleGroup, Field, Input, Select, DatePicker (Popover + Calendar), TimePicker (hour and minute Selects), Alert, Toast. Don't hand-roll drawers, selects, date or time pickers, option sets, or status pills; don't use native date or time inputs. Use real route links and the Cozy Care glyphs in `src/components/ui/icon.tsx`; extend with Lucide only for missing glyphs. Use a 44px minimum control target. Let text wrap and layout grow. Respect keyboard focus, system safe areas, and reduced motion.
- Forms follow the [form conventions](docs/forms.md), with Add medicine as the reference. Show each error under its control, above its help text, after the first submit; focus the first invalid control. Choices of two or three short options are a ToggleGroup with nothing preselected when a wrong default could be saved. Use one Alert above one full-width primary action. While the device is known offline, the primary reads _Connect to save_ (disabled) and an Alert says values stay until she leaves the page.
- Use Drawer for every slide-in panel: a content-sized bottom drawer on phone and desktop, capped at a readable width, without snap points. Swiping, Close, backdrop press, and Escape dismiss it and discard unsaved input; refuse all of them while a save is pending and disable Close. Keep its swipe handle and Cozy Care scrim, radius, and safe-area padding.
- The record drawer asks _What happened?_ with an explicit outcome choice and saves nothing until the user saves. Taken offers _Now_, the scheduled time once it has passed, or _Other_ date and time, plus an amount. Skipped confirms the skip and records no intake time or quantity.
- Keep medication identity tiles decorative. Distinguish _Scheduled_, _Due now_, _Not logged_, _Taken_, and _Skipped_ with text and icon. Keep scheduled time separate from actual intake and from skip confirmation.
- Keep explicit confirmation, progress, retries, correction, and stale-state handling. Use a factual success announcement after the server confirms the save; `toast.add({ title, type })` shows it. Dose outcomes have no Undo (FE-648 F2): correct them through the dose drawer. Use loading, empty, and recovery states appropriate to the screen.

## Loading and saving

- Show headings, navigation, and data-independent controls immediately. Use a skeleton only for a section with no usable data, never while refreshing or saving content already shown.
- Match the loaded layout so nothing shifts when content arrives: same widths, radii, gaps, and minimum heights. Today shows the hero (28px radius) and three rows of 64px minimum height with 10px gaps. Medications shows four 76px rows. History shows the 46px date field and three rows. Use fixed placeholder counts; never size skeletons from guessed list lengths.
- Fill skeletons with the sunken surface (the hero uses blush). Skeletons are static: no shimmer or pulse at any motion setting. Mark skeletons `aria-hidden` and give each loading section one polite `role="status"` label, such as _Loading Today_. Don't announce individual placeholders or background refreshes.
- Route skeletons compose the shared `Skeleton` and `LoadingSection` primitives; Today's composition is shared with the cold launch. The cold launch (FE-649 L1, the root loading fallback) is the reference: shell and nav, header bars beside the real Settings button, Today's skeleton and one _Opening Meddies_ status.
- Refreshing keeps content and shows progress only on the refresh control. A failed refresh keeps content and adds a recoverable alert.
- Saving disables the form and labels the primary action _Saving…_. Dose recording and correction show the chosen outcome on affected rows as a _Saving…_ outline badge until the server confirms; setup and schedule edits never show optimistic state.
- A definite failure clears only that save's pending state, keeps the entered values, and shows an alert above the primary action. An unconfirmed save keeps values and turns the primary action into _Retry_: _Save could not be confirmed. Your details are still here. Connect and retry._ A form with no details (skip) omits the middle sentence; after a fresh load finds no record, add _Meddies checked and found no record yet._ A conflict applies nothing and offers _Review current outcome_.
- Pending saves and their failures stay visible after navigating away. Review affected loading, refreshing, saving and failure states under the [visual verification policy](docs/verification.md#visual-verification).

## Reference screens

Use synthetic data in production routes. Review Today with a next occurrence and unresolved doses, Medications with and without schedules, and the dose drawer for record and review. Check History for cross-date intake, first-schedule setup for validation, and signed-out and unavailable states for recovery. These are reference scenarios, not a checklist for every change. For meaningful UI changes, review affected screens and states at 402px. Add narrow-screen, enlarged-text, reduced-motion, keyboard and device checks when relevant under the [verification guide](docs/verification.md#visual-verification). Reuse current evidence for unchanged behavior.

The Cozy Care export in `.agents/skills/meddies-design/` supplies the visual source. [FE-612](https://linear.app/karacadev/issue/FE-612/record-the-approved-mobile-ux-contract) and the linked UX and domain specs govern interactions.
