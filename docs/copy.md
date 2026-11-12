# Copy

How Meddies speaks. These rules cover every string the user sees or hears: labels, messages,
toasts, validation, empty, loading and error states, screen-reader text and push reminders.
Where wording quoted elsewhere differs, such as in DESIGN.md or a design snapshot, this doc wins.

## Voice

A calm friend who keeps your pill box tidy: warm and brief, never clinical, never cutesy.

- Address the user as "you", and by first name in greetings.
- Use sentence case and short instructions.
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

`pnpm lint` fails when outcome, intake, confirmed, unconfirmed or correct appears as a whole word
in JSX text or in an `aria-label`, `label` or `title` prop in `src`. Review covers the rest:
"routine", which stays fine in sentences like the sign-in tagline, "medicine", and plain string
constants.

## Dates and times

Every date and time comes from `src/lib/calendar-date.ts`, in Istanbul time whatever the device
timezone. Lint rejects `Intl.DateTimeFormat` and `toLocale*String` anywhere else in `src`.

| Format             | Example                                                                | Used for                                        |
| ------------------ | ---------------------------------------------------------------------- | ----------------------------------------------- |
| Short day          | `Tue 10 Nov`, or `Tue 1 Jan 2036` outside the current Istanbul year    | Dates inside a sentence or status line          |
| Long day           | `Tuesday, 10 November`, or `Tuesday, 1 January 2036` outside that year | Day headings and screen-reader day names        |
| Today-relative day | `Today, Sun 8 Nov`                                                     | Date picker value and History's load error only |
| Time               | `14:05`, 24-hour, midnight `00:00`                                     | Every time of day                               |

Never show or announce an ISO date. A dose due today shows no date.

## Errors

Say what happened, what is safe, and what to do next.

- Never say "failed" when the result is unknown. Say it might not have saved.
- Only say the details are still here when the form holds details.

## Changing copy

- Change words only, never layout, flow or behaviour. A confusing flow becomes its own ticket.
- Rewrite existing strings. Add a new message only where a state gives no next step. Add no new
  greetings, encouragement or tips. Warmth belongs in the wording of a message that already exists,
  as in a short clause like "whenever you're ready".
- Keep strings inline next to their components, except one small shared module for repeated save
  and session messages.
- Change tests in the same commit as their copy, and keep selecting by visible text and accessible
  name.

## Calibration examples

The target warmth.

| Instead of                                                       | Write                                                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| No doses scheduled for today.                                    | Nothing to take today. You're all set.                                                             |
| No medicines saved yet.                                          | No medications here yet. Add your first one whenever you're ready.                                 |
| Today could not be refreshed. Connect to the internet and retry. | Today didn't update just now. Check your connection and try again.                                 |
| Confirm skipped dose                                             | Skip this dose                                                                                     |
| Unsaved details from earlier.                                    | Pick up where you left off. Your details are still here.                                           |
| That date is not available.                                      | Nothing to show for that day.                                                                      |
| Save could not be confirmed.                                     | That might not have saved. Your details are still here - just check your connection and try again. |
