# UX audit - November 2026

Audit only: nothing here is approved, and no application code changed. Findings are evidence for
later tickets, not product rules. If a recommendation conflicts with [PRODUCT.md](../PRODUCT.md),
[DESIGN.md](../DESIGN.md) or the [product docs](product/README.md), the docs win until a decision
in [Open decisions](#6-open-decisions) changes them.

**Method.** Impeccable critique with three isolated assessments, run on 14 Nov 2026 against the
local stack (`pnpm dev:stack`, Next dev) at 402x874 in Chromium via `agent-browser`:

- **A1** design review: Today, dose logging, History
- **A2** design review: Medications, setup, schedules, Settings, sign-in, barcode scanner
- **B** detector: `impeccable detect` on `src/app`, `src/features`, `src/components`, plus an in-page
  overlay on 10 views

Each assessment used a fresh synthetic owner and built its data through the real UI. States that
can't be produced live (pending, might not have saved, conflict, offline) were checked in design lab
frames or source, and are labelled that way. Chromium at 402px is not iPhone evidence: no finding
covers VoiceOver, the software keyboard, safe areas or the installed PWA.

**Evidence labels.** _Live_ = reproduced in the running app. _Source_ = read in code, not seen
rendered. _Lab_ = design lab frame. Confidence is one of **Confirmed**, **Preference** (a design
judgment) or **Unverified**. **DECISION** marks a fix that touches dose semantics, safety or an
approved rule.

## 1. Executive summary

The core is sound: an explicit _What happened?_ choice with nothing preselected, primaries that
name the result (_Save as taken_), toasts that state exactly what was saved, and calm, exact
confirmations for Pause, Stop and Remove. Cozy Care holds up across every screen. The detector found
nothing in source; in the browser it flagged one token issue.

The biggest problems are about status and next action, not visuals:

1. **_Due now_ never appears.** A dose turns _Not logged_ within the minute it falls due, so
   opening Meddies from a reminder shows a just-due dose as already Not logged (F1).
2. **Up next points away from the waiting doses.** While _To log_ holds unlogged doses, the hero
   (the loudest element) offers _Taken_ for a dose hours away (F2).
3. **Yesterday's Not logged dose can't be logged anywhere.** History rows aren't buttons and Today
   shows only today. The glossary says these doses can still be logged (F3).
4. **The correction time picker is unreadable.** In the Edit dose drawer the hour and minute stack
   one digit per line ("1 / 1 : 1 / 9") at 402px (F4).
5. **A saved medication can't be edited or removed.** A typo or a unit-less strength stays forever,
   and ended medications pile up. No spec or ticket covers this (F5).

The next layer is consistency: two labels for "change this dose", two ways to write a half tablet,
two form styles for one schedule decision, and a medication page whose loudest button is _Stop
schedule_.

**Heuristic score: 26/40 (Acceptable).**

| #   | Heuristic                   | Score | Key issue                                                                   |
| --- | --------------------------- | ----- | --------------------------------------------------------------------------- |
| 1   | Visibility of system status | 2     | _Due now_ is unreachable (F1); Paused is a muted footnote (F21)             |
| 2   | Match with the real world   | 3     | Occasional use is drawn as unfinished setup (F9)                            |
| 3   | User control and freedom    | 2     | No edit or remove for a medication (F5); past Not logged is a dead end (F3) |
| 4   | Consistency and standards   | 2     | 1.5 vs 1½, two change labels, two schedule form styles (F6, F7, F13)        |
| 5   | Error prevention            | 2     | The hero invites logging the wrong dose early (F2)                          |
| 6   | Recognition over recall     | 3     | Clock setup has no _Next doses_ preview; Interval and Clock change do (F13) |
| 7   | Flexibility and efficiency  | 3     | Hero to saved takes 2 taps; a late log takes 4; 60-option minute list       |
| 8   | Aesthetic and minimalist    | 3     | Four same-weight buttons on the medication page (F14)                       |
| 9   | Error recovery              | 3     | Good wording; some recovery bodies run to three sentences (F24)             |
| 10  | Help and documentation      | 3     | Inline facts work; "0 of 0 logged" confuses (F8)                            |

**Design specificity.** This is authored, not generic. The status words with the recorded time in
the badge (_Taken 11:20_), the "3 min after scheduled" offset, the early-save warning, the
overnight moon in the Interval preview, and the dashed incomplete card all come from this product's
rules. Where it slips, the cause is semantics and edge-case wording, not a template look.

**Cognitive load: moderate (3 of 8 checks fail).**

- **Single focus and hierarchy:** the hero competes with _To log_ (F2), and the medication page has
  no primary (F14).
- **Working memory:** _Edit dose_ next to _Change this dose_ makes her remember which does what
  (F6).
- **Progressive disclosure:** _Other_ opens a full month calendar for two valid days (F17). In
  Clock setup, the times sit below the start date and Last day (F13).

No decision point shows more than 4 options except the hour (24) and minute (60) Selects, and the
6 _Every_ chips, which scan fine.

## 2. Screen inventory

| Area             | Screens and states inspected                                                                                                                                                                                         | Evidence      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Today            | Empty; one medication; hero with _To log_, _Later today_ and _Logged_; Not logged rows; unscheduled Taken row; success toasts; 320px                                                                                 | Live          |
| Dose drawer      | Record before due (early-save alert), at due, late; Taken with _Now_ / scheduled time / _Other_; amount stepper with halves; Skipped; Taken review; Edit dose; change Taken↔Skipped; Cancel, Escape, backdrop; 320px | Live          |
| Unscheduled dose | Log from a medication page, change, remove confirm, cross-date (yesterday 23:30)                                                                                                                                     | Live          |
| Save states      | Pending badge, might not have saved, conflict, offline _Connect to save_                                                                                                                                             | Source, Lab   |
| History          | Today, past day with an unscheduled dose, empty day, date navigation, DatePicker                                                                                                                                     | Live          |
| History          | Past-day Not logged rows                                                                                                                                                                                             | Source        |
| Medications      | Empty; mixed list (scheduled, paused, no schedule, Ended, long name); 320px                                                                                                                                          | Live          |
| Add medication   | Empty, empty-submit errors, Type menu, filled, offline _Connect to save_, 320px                                                                                                                                      | Live          |
| Medication page  | After first save (_Done for now_), no schedule, daily, weekdays + Last day, Interval, paused, resumed, Ended, _Log a dose_                                                                                           | Live          |
| Schedule screens | Clock setup (errors, two times, ½ step); Interval setup (_Every_ and _Starts_ sub-drawers, preview); Clock change with preview; Interval resume; Pause and Stop confirms                                             | Live          |
| Settings         | Inset list, sign-out                                                                                                                                                                                                 | Live          |
| Sign-in          | Root sign-in, `/sign-in/error`, `/sign-in` (404), 404                                                                                                                                                                | Live          |
| Barcode scanner  | Approved frame `193·B·Scanner`, camera-off state, `barcode-scanner.tsx`                                                                                                                                              | Lab, Source   |
| Not built yet    | Stock tracking, refill, low stock, food reminder, Liquid/Inhaler/Drops, reminders and quiet hours, export, history and account deletion (#29-57, #197, #266, #267). Copy that promises them was checked (F10).       | Not inspected |

## 3. Prioritized findings

### P1 - Major

**F1 - Today: _Due now_ never shows; doses go from Scheduled straight to Not logged.** DECISION

- **Evidence (live and source):** at 11:21:39 the 11:21 Vitamin D3 row already read _Not logged_.
  `occurrenceFor` returns _Due now_ only when `dueAt === nowIso`
  ([occurrences.ts:71](../src/features/schedules/occurrences.ts#L71)), and `nowIso` carries
  seconds and milliseconds (the minute timer fires at +50 ms,
  [use-schedule-now.ts:23](../src/features/schedules/use-schedule-now.ts#L23)). Built frame
  `238·A1` has no Due now row either. Confirmed.
- **Impact:** the blush `due` badge and the _Due now_ status in [DESIGN.md](../DESIGN.md) (lines
  49-52) never render. Opening Meddies from a reminder or a follow-up shows "Not logged" for a dose
  that is due right now. That reads as a quiet reproach, and it makes Meddies look behind reality.
  A1 rated this P0; it is P1 here because logging still works.
- **Fix:** compare at minute precision and give _Due now_ a window. Options: the due minute only;
  until the last bounded follow-up ([reminders.md](product/reminders.md)); or until the next dose
  of the same schedule. Add a _Due now_ entry to [GLOSSARY.md](../GLOSSARY.md), which has none.

**F2 - Today hero: Up next skips the waiting doses and offers Taken for a dose hours away.** DECISION

- **Evidence (live):** with _To log · 2_ (11:19 and 11:21 Not logged), the hero showed _Scheduled ·
  21:00_ with a berry _Taken_ button. Tapping it at 11:27 opened the drawer with "9 h 33 min before
  scheduled". `next` picks the first unresolved dose with `dueAt >= now`
  ([occurrences.ts:107-110](../src/features/schedules/occurrences.ts#L107-L110)). Confirmed.
- **Impact:** it breaks Product Principle 5 ("the next action on Today is obvious"). The loudest
  tap can record the wrong dose, though the early-save alert softens that. The hero button reads
  _Taken_, a status word, where every other entry point says what she did.
- **Fix:** while _To log_ has doses, give the hero to an unresolved dose, using the existing hero
  with its eyebrow showing _Due now · 11:21_ or _Not logged · 11:19_. Otherwise keep the next
  scheduled dose. Choosing the oldest or the newest unresolved dose is the decision.
- **Copy:** hero button _Taken_ → _I took it_, which matches the drawer's choice. It still opens
  the drawer, so nothing saves on one tap.

**F3 - History: a past day's Not logged dose can never be logged.** DECISION

- **Evidence (source):** _Record it on Today_ shows only when `date === today`
  ([history-day.tsx:264](../src/features/schedules/history-day.tsx#L264)), past Not logged rows
  aren't buttons, and Today lists only today's doses. Live reproduction wasn't possible: a new
  schedule never adds earlier times. Confirmed by reading the code.
- **Doc conflict:** [GLOSSARY.md:94-96](../GLOSSARY.md) says a Not logged dose "can still be
  logged". [medication-domain.md](product/medication-domain.md) lines 143, 166, 168 and 172 say
  "still loggable". [DESIGN.md:66](../DESIGN.md) says "Not logged rows are not buttons".
- **Impact:** she takes the 23:00 dose, forgets to log it, and next morning has no way to record it.
  Her history stays wrong, and once stock tracking ships, so does her count.
- **Fix:** past Not logged rows open the same record drawer. `DoseActions` already handles
  _Other_ date and time. DESIGN.md:66 then changes.

**F4 - Dose correction: the time picker stacks its digits.**

- **Evidence (live):** in the Taken review → _Edit dose_ → _Other_, and in the unscheduled change
  drawer, the hour and minute triggers render "1 / 1" and "1 / 9", one digit per line. The same
  picker reads fine in the log drawer. The two-column grid
  ([taken-form.tsx:280](../src/features/schedules/taken-form.tsx#L280)) leaves the triggers too
  narrow beside the long _Today, Sat 14 Nov_ date value. Confirmed.
- **Impact:** the time is the thing she came to fix, and it's the hardest thing to read.
- **Fix:** keep the triggers' digits on one line (`whitespace-nowrap` plus a minimum width), or
  stack date and time when the row is too narrow. No new component.

**F5 - Medication page: a medication can't be edited or removed.** DECISION

- **Evidence (live):** every medication page ends with "Details can't be changed here yet."
  ([medication-detail.tsx:254](../src/features/schedules/medication-detail.tsx#L254)). A strength
  saved as "1000" with no unit shows as "1000 · capsule" forever, and Ended medications stay in the
  list. No product doc or open issue covers editing or removing a medication. Confirmed.
- **Impact:** her record can't be made to match the pack, which undercuts "Truth over
  reassurance". The only workaround, adding it again, makes duplicates.
- **Fix:** _Change details_ reuses the Add drawer, prefilled. Removal reuses the
  schedule-confirm-drawer pattern. What removal does to history and reminders, and whether a unit
  change is allowed once doses are logged, are the decisions.

### P2 - Minor

**F6 - Taken review: _Edit dose_ and _Change this dose_ sit side by side.**

- **Evidence (live):** two outline buttons. _Edit dose_ changes time or amount
  ([taken-form.tsx:184](../src/features/schedules/taken-form.tsx#L184)); _Change this dose_
  switches to Skipped ([dose-actions.tsx:310](../src/features/schedules/dose-actions.tsx#L310)).
  _Edit dose_ stays visible after the edit fields open. Confirmed.
- **Fix:** name what each one changes, and hide the edit button once its fields are open.

| Before             | After                   |
| ------------------ | ----------------------- |
| _Edit dose_        | _Change time or amount_ |
| _Change this dose_ | _I skipped it instead_  |

The Skipped review already uses _I took it instead_.

**F7 - Half quantities appear as both "1.5" and "1½".**

- **Evidence (live):** the Today row reads "took 1.5 tablets", while the toast and History read
  "1½ tablets". The Today row builds its text by hand
  ([today-schedule.tsx:91-94](../src/features/schedules/today-schedule.tsx#L91-L94)) instead of
  using `quantityLabel` as History does. [medication-domain.md](product/medication-domain.md)
  (line 38) keeps the half glyph. Confirmed.
- **Fix:** use `quantityLabel` on the Today row.

**F8 - History: "0 of 0 logged" beside a Taken dose.**

- **Evidence (live):** on 13 Nov, an unscheduled Taken dose sits under the heading "0 of 0 logged".
  The count covers scheduled doses only
  ([history-day.tsx:188](../src/features/schedules/history-day.tsx#L188)). Confirmed.
- **Fix:** hide the count when the day has no scheduled doses.

**F9 - A medication with no schedule always reads as unfinished.** DECISION

- **Evidence (live):** it gets the dashed card, "No schedule yet." and _Set schedule_ as the page
  primary, with _Log a dose_ secondary. [PRODUCT.md](../PRODUCT.md) lists "no schedule for
  occasional use" as a supported choice, while [DESIGN.md](../DESIGN.md) (line 10) treats it as
  incomplete. Confirmed.
- **Impact:** her painkiller looks like a to-do forever.
- **Fix:** if no schedule is a valid end state, label it _As needed_, drop the dashed card, and make
  _Log a dose_ the primary. _Set schedule_ moves to secondary.

**F10 - Pause confirmation promises refill alerts that don't exist.**

- **Evidence (live and source):** "Refill alerts keep going."
  ([schedule-confirm-drawer.tsx:31](../src/features/schedules/schedule-confirm-drawer.tsx#L31)).
  Stock tracking and refill alerts are open issues #46-53. Confirmed.
- **Impact:** it breaks Product Principle 1 by claiming a safeguard that isn't there.
- **Fix:** show the line only when that medication tracks stock. Until #52 ships, remove it.

**F11 - Tile shape contradicts the medication's type.**

- **Evidence (live and source):** the Type menu teaches that tablets are round and capsules are
  capsule-shaped. Saved tiles pick tint and shape from the last character of the ID
  ([medication-tile.tsx:44](../src/features/medicines/medication-tile.tsx#L44)), so Paracetamol (a
  tablet) shows a capsule and Omega 3 (a capsule) a round dot. Confirmed.
- **Fix:** derive the shape from the unit and keep the tint per medication. DESIGN.md says tiles
  "keep their brand shapes"; this keeps them while making them truthful.

**F12 - Back after a schedule change lands on the same page.**

- **Evidence (live):** medication page → _Change schedule_ → save replaces `?schedule=` with
  `?medicine=` (DESIGN.md:20). The first Back shows the same medication page again, because the
  page you started from is still in history. Pause → Resume Interval and _Set schedule_ from the
  page behave the same way. Confirmed.
- **Impact:** the first Back appears to do nothing.
- **Fix:** when the edit opened from that medication's page, return to it with
  `router.back()` and show the confirmation there. Keep replace for entries from the list or a
  direct link. DESIGN.md:20 gains that clause.

**F13 - Schedule setup: two form styles, and the times sit below the fold.**

- **Evidence (live):**
  - _Set times_ uses stacked Fields; _Every few hours_ uses inset drill-in rows with Cancel/Done
    sub-drawers.
  - The Istanbul intro shows only for _Set times_.
  - Clock **change** has a _Next 3 doses_ preview; Clock **setup** doesn't.
  - At 402px, Time 1 starts around y=650, below intro, kind, Days, Start date and Last day. The hour
    list opens at 00.
  - Confidence: confirmed; which style should win is a preference.
- **Fix:** add the existing preview (`interval-dose-list`, `clock-preview.ts`) to Clock setup, and
  order the form Times → Days → Start date → Last day. Open the hour list near the current hour.
  Unifying the two styles is a separate design ticket.

**F14 - Medication page: no primary, and _Stop schedule_ is the loudest button.**

- **Evidence (live):** _Change schedule_, _Pause_, _Stop schedule_ and _Log a dose_ are all full
  width or half width. Only _Stop schedule_ has a fill, the soft destructive one. The saved
  confirmation is a dark inline block that looks like a toast and stacks above real toasts.
  Confirmed.
- **Fix:** keep _Change schedule_ as the outline lead. Put _Pause_ and _Stop schedule_ in one quieter
  row (ghost Buttons), with the destructive tint only inside the Stop confirm. Show the saved
  confirmation as an Alert (default variant), the pattern DESIGN.md already uses for inline
  messages.

**F15 - Scanner (future): "Turn it on in Settings" is ambiguous.**

- **Evidence (lab and source):** [barcode-scanner.tsx:185](../src/features/medicines/barcode-scanner.tsx#L185),
  frame `193·B·Scanner`. Meddies has its own Settings tab, so "Settings" points the wrong way.
  Confirmed in copy.
- **Fix:**

| Before                                                                  | After                                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Camera is off for Meddies. Turn it on in Settings, or type the details. | Camera is off for Meddies. Turn it on in your iPhone settings, or type the details. |

- **Also unverified, to settle in #196 and #198:** the camera prompt fires on open with no line
  explaining it first; a read that stalls gets no hint; it's unclear what a looked-up form other
  than Tablet or Capsule does; #198 cites `/medications?mode=add`, but the live route is `?add`.
- **What works:** the scanner is an optional row, _Type it in instead_ is always visible, scanned
  values are hints she checks, and nothing saves before _Save medication_.

### P3 - Polish

| ID  | Where                | Evidence                                                                                                                                                                                                                                                                                             | Fix                                                                                                                                                                                  | Conf.      |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| F16 | Dose saves           | Unscheduled log reads _Save dose_; Skipped→Taken reads _Save changes_; toasts mix "changed to", "updated to"; an amount-only change says "changed to taken" (live)                                                                                                                                   | _Save as taken_ in both; amount-only toast: "Ibuprofen 09:30 · now 1 tablet"                                                                                                         | Confirmed  |
| F17 | Taken date (_Other_) | A full month calendar where 28 of 30 days are disabled; only today and yesterday are valid (live)                                                                                                                                                                                                    | Today / Yesterday ToggleGroup. DESIGN.md mandates DatePicker for dates, so this needs a design call                                                                                  | Preference |
| F18 | Review drawers       | An unscheduled dose opens straight into fields; a scheduled Taken dose opens a summary first (live)                                                                                                                                                                                                  | Open both with the summary and change buttons                                                                                                                                        | Preference |
| F19 | Hero and drawer chip | The hero repeats the first _Later today_ row; the drawer chip reads "Scheduled 21:00 · Scheduled" (live)                                                                                                                                                                                             | Drop the badge when it repeats the label                                                                                                                                             | Preference |
| F20 | Drawer at 320px      | Title breaks mid-word ("Levothyrox / ine"); Save falls below the fold under the early-save alert (live)                                                                                                                                                                                              | `overflow-wrap: break-word` on the title                                                                                                                                             | Confirmed  |
| F21 | Paused status        | Paused shows only as a muted footnote; the card header still says "Every day"; the row has no icon (live). PRODUCT.md asks for text and icon                                                                                                                                                         | Neutral Badge _Paused_ with the Pause icon on the card and row                                                                                                                       | Confirmed  |
| F22 | Save problem colours | The might-not-have-saved alert is `destructive` ([dose-save-problem.tsx:32](../src/features/schedules/dose-save-problem.tsx#L32)) while the badge is amber; the pending badge uses the Clock icon Scheduled uses (source)                                                                            | Default Alert with the warning icon (DESIGN.md: no warning variant); a distinct pending icon                                                                                         | Unverified |
| F23 | Add medication       | Type help "Schedules use whole or half tablets, or whole capsules." shows before a type is chosen; error "Choose tablet or capsule."; errors are grouped under the card, not each control as DESIGN.md requires ([medicine-form.tsx:211-222](../src/features/medicines/medicine-form.tsx#L211-L222)) | Drop the help (the stepper enforces it); error "Choose a type." (survives #266/#267); move errors under their controls                                                               | Confirmed  |
| F24 | Recovery copy        | Medication might-not-have-saved body is three sentences; setup alert says "That might not have saved." then "{label} is saved"; conflict link _Open Medications_ shows inside a drawer over Medications (source)                                                                                     | "That might not have saved. Your details are still here - trying again won't add it twice."; "Your schedule might not have saved. {label} itself is saved."; link _See what's saved_ | Confirmed  |
| F25 | Strength             | "1000" with no unit is accepted (live)                                                                                                                                                                                                                                                               | Non-blocking hint: "Add the unit from the pack, like mg or IU." Never infer or require a unit (DECISION)                                                                             | Confirmed  |
| F26 | Interval preview     | Moons on 22:00 and 04:00, but the note says "Includes a dose overnight, at 22:00." ([interval-setup-parts.tsx:201](../src/features/schedules/interval-setup-parts.tsx#L201))                                                                                                                         | Plural when there's more than one: "Includes doses overnight, from 22:00."                                                                                                           | Confirmed  |
| F27 | `/sign-in`           | Signed out, `/sign-in` shows the 404 with the full tab bar; sign-in lives at `/` (live)                                                                                                                                                                                                              | Redirect `/sign-in` to `/`; hide tabs on the signed-out 404                                                                                                                          | Confirmed  |
| F28 | Caption type token   | `--text-caption--line-height: 1.2` ([global.css:63](../src/global.css#L63)) makes two-line captions tight, e.g. the sign-out help (detector)                                                                                                                                                         | 1.35-1.4 for the token                                                                                                                                                               | Confirmed  |
| F29 | Schedule help text   | "added." sits alone on the last line ([schedule-kind-forms.tsx:52](../src/features/schedules/schedule-kind-forms.tsx#L52), detector)                                                                                                                                                                 | `text-pretty`                                                                                                                                                                        | Confirmed  |
| F30 | Docs                 | [scope.md:43](product/scope.md) excludes liquid units; [medication-domain.md](product/medication-domain.md) approves Liquid (#197)                                                                                                                                                                   | Reconcile before #266                                                                                                                                                                | Confirmed  |

**Detector false positives.** `cream-palette` (every page) and `icon-tile-stack` (empty states)
match DESIGN.md's cream canvas and empty-state geometry. Nothing else fired, including in the dose
and Add medication drawers.

## 4. Recommended improvements

**Hierarchy**

- Today has one loud element, and it points at what needs her now: an unresolved dose when there is
  one, the next scheduled dose otherwise (F2).
- The medication page leads with the job she most often comes for: _Change schedule_ for
  scheduled, _Log a dose_ for as-needed. Pause and Stop step back (F9, F14).
- A saved confirmation is an Alert, not a toast look-alike (F14).

**Navigation**

- Back after an edit returns to where she started, without a duplicate entry (F12).
- History reaches every Not logged dose, not just today's (F3).

**Interactions**

- _Due now_ gets a real window, so the attention state appears when a reminder lands (F1).
- The correction time stays readable (F4); _Other_ date becomes two choices if the design call
  allows (F17).
- Clock setup gets the preview it already has in change mode, and leads with the times (F13).

**Copy**

- Every change label names the change (F6), every save names the result (F16), and every quantity
  uses one notation (F7).
- Remove claims about unbuilt features (F10) and wording that points at the wrong Settings (F15).

**Kept as is:** the record drawer's explicit choice and disabled _Choose what happened_ primary,
the early-save offset alert, toasts that name scheduled and actual times, and the Pause, Stop and
Remove confirm wording.

## 5. Implementation roadmap

Each task is one reviewable change. Tasks marked **D** wait for the matching decision in section 6.

**Today and dose status**

1. **D1** _Due now_ window: minute-precision comparison plus a GLOSSARY entry (F1).
2. **D2** Up next shows an unresolved dose while _To log_ has one; hero button _I took it_ (F2).
3. Today row uses `quantityLabel` (F7).
4. Drop the duplicate badge in the drawer chip (F19).

**Dose logging and correction**

5. Time picker digits stay on one line in correction drawers (F4).
6. Rename _Edit dose_ / _Change this dose_; hide the edit button while its fields are open (F6).
7. Align save labels and toast verbs (F16).
8. Drawer title wraps at word boundaries at 320px (F20).
9. **D6** Today / Yesterday choice for the taken date (F17).
10. Save-problem Alert variant and pending icon, after confirming in a lab frame (F22).

**History**

11. **D3** Past Not logged rows open the record drawer; update DESIGN.md:66 (F3).
12. Hide "0 of 0 logged" on days without scheduled doses (F8).

**Medications and medication page**

13. Tile shape follows the unit (F11).
14. Pause and Stop in one quieter row; saved confirmation as an Alert (F14).
15. Paused badge on the card and row (F21).
16. **D4** _As needed_ state for medications with no schedule (F9).
17. **D5** Change details and remove a medication (F5): design ticket first.

**Medication setup and schedules**

18. Add medication copy and per-control errors (F23); strength unit hint (F25).
19. Clock setup preview, times first, hour list opens near now (F13).
20. Back returns to the medication page after an edit started there (F12).
21. Remove "Refill alerts keep going." until #52 (F10).
22. Overnight note plural (F26); recovery copy (F24).

**Scanner, sign-in, foundations, docs**

23. Scanner camera-off copy; carry F15's open points into #196 and #198.
24. `/sign-in` redirect and signed-out 404 without tabs (F27).
25. Caption line height token (F28) and `text-pretty` on help text (F29).
26. Reconcile scope.md with the approved Liquid rules (F30).

## 6. Open decisions

| ID  | Question                                                                                                                                                                                           | Why it's yours                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| D1  | How long is a dose _Due now_: the due minute, until the last follow-up, or until the schedule's next dose?                                                                                         | Dose-state rule; affects Today grouping and reminder wording (F1)                    |
| D2  | When doses wait in _To log_, which leads Up next: the oldest, the most recent, or none?                                                                                                            | Dose priority; changes the most-tapped control (F2)                                  |
| D3  | Can a past day's Not logged dose be logged from History? GLOSSARY and medication-domain say yes; DESIGN.md says rows aren't buttons. Should yesterday's late doses also stay on Today for a while? | Resolves a doc conflict about history truth (F3)                                     |
| D4  | Is "no schedule" a lasting _As needed_ state or unfinished setup?                                                                                                                                  | Changes list grouping, the dashed card and the page's primary (F9)                   |
| D5  | What can she change on a saved medication (name, strength, unit), and what does removing one do to its history and reminders?                                                                      | Record integrity; a unit change after doses are logged changes quantity meaning (F5) |
| D6  | May the taken date use a Today / Yesterday ToggleGroup instead of DatePicker?                                                                                                                      | Exception to a DESIGN.md rule (F17)                                                  |
| D7  | Keep 1-minute steps in the minute picker, or move to 5 minutes?                                                                                                                                    | Reminder and schedule precision (F13)                                                |
| D8  | Should Up next also stay in its group, or leave the list?                                                                                                                                          | Hierarchy preference; DESIGN.md is silent (F19)                                      |
