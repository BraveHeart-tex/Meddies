# Copy

How Meddies speaks. These rules cover every string the user sees or hears: labels, messages,
toasts, validation, empty, loading and error states, screen-reader text and push reminders.
Where wording quoted elsewhere differs, such as in DESIGN.md or a design lab frame, this doc wins.

## Voice

A calm friend who keeps your pill box tidy: warm and brief, never clinical, never cutesy.

- Address the user as "you", and by first name in greetings.
- Use sentence case and short instructions. Uppercase is only for small eyebrows ("UP NEXT").
- Buttons name the result: "Save as taken", never "OK".
- Reassure through facts. Confirmations state exactly what was saved.
- Never imply a dose was taken unless it was recorded.
- No guilt or pressure, no exclamation marks, no emoji.
- Give no medical advice.

## Speaker

Meddies never says "I" or "we". Use no speaker, or name Meddies. The user's own choices use first
person: "I took it".

## Status words

Scheduled, Due now, Not logged, Taken and Skipped are fixed. Never write "Missed" or "Overdue".

## Banned words

These are banned in UI copy and stay fine in code, docs and tickets, including the
[glossary](../GLOSSARY.md) terms built on them.

| Banned                   | Write instead                             |
| ------------------------ | ----------------------------------------- |
| outcome                  | what happened, or name it: Taken, Skipped |
| intake                   | dose, or "taken"                          |
| correct (as a verb)      | change, fix                               |
| confirmed, unconfirmed   | saved, "might not have saved"             |
| routine (as a data noun) | schedule, doses                           |

Say "medication", never "medicine", and call the tab "Medications". The `/medications` URL and code
names stay.

Use “Amount” for an editable dose quantity in schedule and dose forms. Keep Strength distinct
from Amount; internal domain terminology stays unchanged. Use “dose unit” in UI copy for the
domain term Quantity unit. Keep Type and dose unit as separate facts.

`pnpm lint` fails when outcome, intake, confirmed, unconfirmed or correct appears as a whole word
in JSX text or in an `aria-label`, `label` or `title` prop in `src`. Review covers the rest:
"routine", which stays fine in sentences like the sign-in tagline, "medicine", and plain string
constants.

## Numbers

Put a space between a number and its unit (`200 mg`, `1000 IU`), and give quantities their unit
(`1 tablet`, `8 left`). Separate facts on one line with a middle dot: `200 mg · tablet`.

## Dates and times

Every date and time comes from `src/lib/calendar-date.ts`, in Istanbul time whatever the device
timezone. Lint rejects `Intl.DateTimeFormat` and `toLocale*String` anywhere else in `src`.

| Format             | Example                                                                | Used for                                                                                         |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Short day          | `Tue 10 Nov`, or `Tue 1 Jan 2036` outside the current Istanbul year    | Dates inside a sentence or status line, Taken date choices, and a dose from another day on Today |
| Long day           | `Tuesday, 10 November`, or `Tuesday, 1 January 2036` outside that year | Day headings and screen-reader day names                                                         |
| Today-relative day | `Today, Sun 8 Nov`                                                     | Date picker value and History's load error only                                                  |
| Time               | `14:05`, 24-hour, midnight `00:00`                                     | Every time of day                                                                                |

Never show or announce an ISO date. A dose due today shows no date.

## Errors

Say what happened, what is safe, and what to do next.

- For reads with no usable data, say “Couldn’t load” and name the content. For refresh
  failures, say “Couldn’t update” and identify the previously loaded details still shown.
  Keep the retry action beside its error and preserve any loaded timestamp or requested date.
- Never say "failed" when the result is unknown. Say it might not have saved.
- Name a cause only when known. Otherwise say, for example, "Camera unavailable. Enter the
  medication details instead."
- Only promise retained details when the form holds details. For offline forms, state the
  boundary: "Keep Meddies open to retain these details. Reconnect to save." Forms without
  entered details say "You're offline. Reconnect to save."
- Conflicts name what changed elsewhere, then say "Your changes weren't saved." Keep the
  action to review the current saved details.
- Sign-out and session end never cancel a save: say Meddies can't show its result until the user
  signs in again, never that it was cancelled.

## Changing copy

- Change words only, never layout, flow or behaviour. A confusing flow becomes its own ticket.
- Rewrite existing strings. Add a new message only where a state gives no next step. Add no new
  greetings, encouragement or tips.
- Helper text explains consequences rather than repeating labels.
- Type helpers must not teach a later scheduling task.
- Include an empty-state body only when it adds information beyond the heading and action.
- Keep strings inline next to their components, except save messages repeated across forms and
  dose saves, which live in `src/lib/save-messages.ts`.
- Change tests in the same commit as their copy, and keep selecting by visible text and accessible
  name.

## Calibration examples

The target warmth.

| Instead of                                                       | Write                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| No doses scheduled for today.                                    | No doses scheduled today                                                                    |
| No medicines saved yet.                                          | No medications yet                                                                          |
| Today could not be refreshed. Connect to the internet and retry. | Couldn’t update Today. Showing previously loaded details.                                   |
| Confirm skipped dose                                             | Skip this dose                                                                              |
| Unsaved details from earlier.                                    | Unsaved details restored.                                                                   |
| That date is not available.                                      | Nothing to show for that day.                                                               |
| Save could not be confirmed.                                     | That might not have saved. Check your connection, then retry. Retrying won't save it twice. |

For Strength, keep the pack example short: “On the pack, e.g. 200 mg. Not your dose amount.”

## Scheduling examples

- Clock times use Istanbul time. Only doses after saving are added.
- An Interval preview needs an interval and start time. Its first dose counts forward from that
  time, including across midnight.
- A Last day includes its doses: “Includes doses on Tue 10 Nov.” No Last day needs no helper.
