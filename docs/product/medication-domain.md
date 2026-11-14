# 03 - Medication & Dose Domain

## Domain and Dose Logging - Approved Contract

The entities below are conceptual distinctions, not an approved database schema.

- **UserMedication** is the personal medication record, independent of a later **CatalogProduct**. It may have no catalog reference and no recurring schedule.
- **MedicationSchedule** defines recurrence, effective dates and versioned expectations. **DoseOccurrence** identifies one expected dose; **DoseRecord** holds an explicit outcome, actual taken time, quantity and corrections. Unscheduled intake does not require an occurrence.
- **StockMovement** represents intake consumption, refill and count reconciliation independently of reminder delivery. Medication strength (e.g., mg) and recorded quantity are different fields.
- Only user confirmation establishes **Taken** or **Skipped**, attributed to the intended occurrence; a reminder being delivered, acknowledged or opened never does. An unconfirmed occurrence is **Due now** for 15 minutes from its due time, then **Not logged**, never automatically missed or skipped ([#275 rules](#275---approved-dose-status-and-late-logging-rules-november-14-2026)). Actual intake time is distinct from scheduled due time.
- Supported Medicine types and quantities follow [Medicine types and quantity units](#medicine-types-and-quantity-units). Fractional capsules and unlisted forms are unsupported.
- Taken consumes the explicitly recorded quantity; Skipped consumes nothing. Corrections, refills and retries reconcile stock once. A zero/insufficient count never blocks truthful intake; displayed stock is non-negative with a correction prompt.
- Optimistic dose outcomes are unconfirmed presentation only. Server records remain authoritative; success announcements, reminder cancellation and confirmed stock require server receipt. Rejection and uncertain receipt follow the topic 02 [session contract](./ux-journeys.md#session-contract).
- Stable occurrence IDs, schedule versions, client action IDs and revisions preserve history, prevent duplicate effects and support conflict resolution. Online stale revisions/conflicting outcomes require explicit recovery, not silent last-write-wins; preserve existing evidence, idempotency and server correctness. Stock is uncertain and affected reminders stop when a genuine unresolved conflict is known to the server. Offline queue and expanded multi-device UX delivery are deferred.
- Unscheduled intake does not reschedule future expected doses. Server history remains until deliberate history/account deletion; deleting history does not reverse past inventory consumption. Full deletion and current online/session scope (including deferred offline capability) belong to [02 - UX & User Journeys](./ux-journeys.md).

Low-stock thresholds, re-arming, uncertain stock and refill pushes follow #10 below.

### Medicine types and quantity units

Medicine type describes the form; Quantity unit describes the amount taken. Strength is a
separate descriptive field. Meddies never derives the amount taken from strength or converts
between dose amounts and container counts.

| Medicine type | Quantity unit | Allowed dose amounts      | Minimum and step | New dose amount |
| ------------- | ------------- | ------------------------- | ---------------- | --------------- |
| Tablet        | tablet        | Positive multiples of 0.5 | 0.5              | 1               |
| Capsule       | capsule       | Positive whole numbers    | 1                | 1               |
| Liquid        | ml            | Positive multiples of 0.1 | 0.1              | 1               |
| Inhaler       | puff          | Positive whole numbers    | 1                | 1               |
| Drops         | drop          | Positive whole numbers    | 1                | 1               |

These rules apply to Clock and Interval schedules, scheduled Taken quantities and their
corrections, and Unscheduled doses and their changes. Numeric bounds preserve safe quantity
arithmetic; there is no medical dose recommendation or arbitrary medical maximum.

Liquid amounts display decimals, such as `0.5 ml` and `1.5 ml`; `ml` never pluralizes. Tablet
halves keep their existing half-glyph wording. Counted units use singular/plural wording,
such as `1 puff` and `2 puffs`. The Type menu starts unset and lists Tablet, Capsule, Liquid,
Inhaler, Drops in that order. Strength help follows the selected Medicine type and describes
the pack's strength without recommending how much to take.

Future stock counts, refills, count corrections and low-stock thresholds use the Medicine's
Quantity unit, such as ml, puffs or drops, rather than bottles or inhalers. Stock remains
optional and follows its existing non-negative display and truthful-intake rules.

Injection is unsupported until its forms and Quantity units have been separately approved.

### #28 - Approved Unscheduled dose rules (November 13, 2026)

See **Unscheduled dose** and **History date** (GLOSSARY.md).

- An Unscheduled dose is always Taken: it keeps an actual intake time and quantity and never requires a schedule or DoseOccurrence. It never stands in for an occurrence: due and Not logged occurrences, later occurrences, Interval Anchors and reminders stay unchanged.
- The user logs it from Medication detail, for any medication, whether its schedule is missing, running, paused or Ended. Today and History do not start one.
- Intake time is Now, or a minute today or yesterday (Istanbul), never in the future. Quantity starts at 1 of the medication's unit and follows the supported quantities above.
- It shows on Today and on History for its History date, the Istanbul day it was taken, in time order among scheduled doses and marked as not on a schedule. It never becomes Today's next dose. Today lists it in place of its empty state. Medication detail shows no list of past Unscheduled doses.
- When the saved intake falls on a day other than today, the save message names that day.
- From Today or History the user can change its intake time and quantity under the same rules, or remove it after a confirm step. A removed Unscheduled dose leaves Today and History; the server keeps its revisions for retry safety and export, and stock treats it as never taken (#50).
- Meddies records what the user reports and gives no advice: no suggestion to take an extra dose, no warning about earlier doses and no limit on how many are logged.
- Each log is its own action with its own action ID: an identical retry returns the saved dose, and two logs at the same minute are two doses. Saves follow the [session contract](./ux-journeys.md#session-contract); stock effects belong to #47 and offline logging stays deferred (D3 in [deferred](./deferred.md)).

| Example           | Setup                                                         | Expected                                                                                       |
| ----------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| No schedule       | Medication with no schedule; log 1 tablet Now at Nov 3 14:10  | Today and the Nov 3 History show it at 14:10, marked; no occurrence is created.                |
| Beside a schedule | Daily 08:00 Not logged and 20:00 due; log 0.5 tablet at 14:10 | 08:00 stays Not logged, 20:00 stays due and next; the 14:10 dose sits between them, marked.    |
| Cross-midnight    | At Nov 4 00:20, log a dose taken Nov 3 23:30                  | It shows on the Nov 3 History, not on Nov 4 Today; the save message names Nov 3.               |
| Separate logs     | Two logs of 1 capsule at 14:10 with different action IDs      | Two Unscheduled doses; neither merges with the other.                                          |
| Remove            | Remove the 14:10 dose after its confirm step                  | It leaves Today and History; its revisions stay on the server; stock treats it as never taken. |

### #275 - Approved dose status and late logging rules (November 14, 2026)

See **Due now** and **Not logged** (GLOSSARY.md). These rules decide what Today and History show
and accept; reminder timing stays in [topic 04](./reminders.md) and changes with none of them. The
Due now and Up next windows present doses; they are not medical guidance.

- **Due now** lasts from an occurrence's due instant until 15 minutes after it, exclusive; then the
  occurrence is Not logged. Follow-ups at +40 and +80 minutes still follow topic 04. A Not logged
  occurrence stays loggable and correctable.
- **Up next** features the most recently due unresolved occurrence due within the last 80 minutes,
  inclusive, the last automatic follow-up slot. Occurrences due at the same instant follow To log's
  order. With none in that window it features the next Scheduled occurrence. Older unresolved
  occurrences stay in To log.
- **Today** also lists, in To log, unresolved occurrences due in the 24 hours before now, showing
  their date. Logging one removes it from Today, and its save message names its History date.
  Logged lists only today's doses.
- **History** lets the user log or skip a Not logged occurrence on any History date, and review
  and change a Taken or Skipped one, with the same dose drawer and rules as Today.
- **Taken time** for an occurrence is never after now and falls on its due date, the day before or
  the day after, in Istanbul time. The server enforces this on every Taken save and every
  correction that sets a time; a correction that keeps the saved time is accepted even when an
  earlier save placed it outside this window. The record drawer offers only those dates, never a
  future one, as actual calendar dates. Unscheduled doses keep their own today-or-yesterday rule
  (#28).

| Example            | Setup                                                               | Expected                                                                                                            |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Due now window     | Daily 09:00, nothing recorded                                       | Due now from 09:00:00 to 09:14:59; Not logged from 09:15. Follow-ups still target 09:40 and 10:20.                  |
| Up next window     | 09:00 Not logged and 21:00 scheduled; now 10:20, then 10:21         | At 10:20 Up next is 09:00, Not logged. At 10:21 Up next is 21:00; 09:00 stays in To log.                            |
| Most recent first  | A due 09:00 and B due 09:30, both unresolved; now 09:35             | Up next is B, Due now. A is Not logged in To log.                                                                   |
| Same instant       | A, B and C due 08:00, unresolved; now 08:05                         | Up next is the first of them in To log; once A is saved, B.                                                         |
| Same medicine      | Every 1 hour, 09:00 and 10:00 unresolved; now 10:05                 | Up next is 10:00, Due now; 09:00 is Not logged in To log.                                                           |
| Across midnight    | Daily 23:30, unresolved; now Nov 14 00:10                           | To log lists the Nov 13 23:30 dose with its date; Up next features it until 00:50. It leaves Today at Nov 14 23:30. |
| From History       | Nov 10 08:00 Not logged; on Nov 14 open the Nov 10 History          | The row opens the record drawer offering Nov 9, 10 and 11; Taken Nov 10 08:30 saves on the Nov 10 History.          |
| Outside the window | Same dose; Taken time Nov 12 08:30                                  | The server rejects it; nothing saves.                                                                               |
| Day before         | At Nov 14 00:20, record the Nov 14 00:15 dose as taken Nov 13 23:50 | Accepted; it shows on the Nov 14 History, taken on Nov 13.                                                          |
| Earlier saved time | Nov 10 dose saved before these rules as taken Nov 14 10:00          | Changing only its quantity is accepted. Changing its time to Nov 14 11:00 is rejected.                              |

### #275 - Approved medicine record rules (November 14, 2026)

See **Detail correction**, **Strength change** and **Archived medicine** (GLOSSARY.md).

- A Medicine with no schedule is a complete record for occasional use, not unfinished setup. It
  reads "No schedule", leads with logging a dose and offers setting a schedule second.
- Editing a Medicine never changes the details its earlier doses were recorded with; History and
  export keep them.
- A **Detail correction** fixes details entered wrongly. Every dose shows the fixed details, and
  the server keeps the earlier values for export.
- A **Strength change** records that the user now takes a different strength of the same
  Medicine. Earlier doses keep their strength in History and export; later doses use the new one.
- Archiving a Medicine keeps every dose, outcome and detail in History and export.

Still open, owned by #292: which instant decides a dose's strength
after a Strength change; whether either edit may change the Medicine type or Quantity unit; what
archiving does to a running schedule, reminders and stock; whether archiving can be undone; and
whether a Medicine with no doses can be deleted.

## Required product behavior

1. Manual medication creation must work without a barcode catalog.
2. A recurring schedule populates Today with expected doses.
3. Taken and skipped are deliberate, distinct outcomes.
4. History reflects the confirmed outcome of each dose, not just the current schedule.
5. The product can display Not logged doses and feed reminder/follow-up logic.
6. Optional per-medicine inventory tracking is part of the approved MVP; it belongs to the user's medication record, not a mutable catalog record.

## Remaining technical and interaction decisions

Still open, as implementation choices: exact schema, APIs, concurrency and locking, migration format, conflict-resolution presentation and cross-platform accessibility. Raise a missing product rule for approval rather than choosing a default. Reminder slots and snooze: [04 - Notifications & Reminder Delivery](./reminders.md). Session and export/deletion: topic 02.

## Scheduling - Approved Contract

The #8 decision table and the acceptance examples below are normative.

### Recurrence and timezone

Daily and selected-weekday schedules use one or more fixed local clock times. Interval recurrence uses an explicit first date/time and repeats by elapsed whole hours, across midnight. All schedules use Europe/Istanbul regardless of device timezone; late logging never re-anchors recurrence.

### Occurrence identity and edit cutoff

Schedule versions and stable occurrence identities preserve already-due expectations and history. An online, server-confirmed edit only replaces occurrences strictly after its effective instant; equality belongs to the old schedule. Logging and corrections never rewrite the planned times.

### End dates, pause and resume

An optional Last day includes its final Istanbul calendar day. No new occurrences or unsent dose-related sends remain at 00:00 the following day; historical occurrences and records remain. Paused periods produce no occurrences/backlog; clock schedules resume at the next configured time and interval schedules require an explicit new anchor. Pending sends also obey outcome, conflict, quiet-hour and next-occurrence suppression rules from topic 04.

### #8 - Approved scheduling boundaries (November 3, 2026)

#### Approved decisions

| ID  | Approved rule                                                                                                                                                                                                                                                                                                                             | Rationale                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Every X hours accepts whole hours from 1 through 24, inclusive. Reject fractions, zero, negative values and values above 24.                                                                                                                                                                                                              | Simple bounded MVP input; includes non-divisors of 24 without changing elapsed recurrence. This is input scope, not dosage advice. |
| D2  | Enabled food reminders accept whole minutes from 1 through 120, inclusive. Disabled is separate from zero. Reject fractions and values outside the range.                                                                                                                                                                                 | Allows precise user-entered heads-up timing with a bounded window; no clinically chosen default.                                   |
| D3  | Let C be the server-confirmed edit effective instant. Preserve old occurrences with due time <= C, including their identity and records. Replace only occurrences due > C; new-version occurrences must also be due > C. Cancel unsent reminders tied to replaced occurrences. Retained occurrences retain existing reminder eligibility. | Equality belongs to the already-due dose, independent of scheduler processing order. No duplicate dose at C.                       |
| D4  | End date E stops both new occurrences and all unsent dose-related reminders at 00:00 on E + 1 day in Europe/Istanbul. Includes automatic follow-ups, explicit snoozes and food reminders. Preserve every earlier occurrence and record for logging/correction.                                                                            | Makes the course end a clear stop boundary; avoids reminders continuing into the next day. No refill-policy change.                |

An occurrence due after C that already has a Taken or Skipped outcome (recorded early on its
day) is not replaced: it stays with the earlier schedule version, keeping its identity and record,
alongside the new version's occurrences.

An edit changing the end date still follows D3: it cannot erase an already-due
occurrence. D4 suppresses its remaining sends if the new end boundary has passed.
Food reminders already submitted for a replaced future occurrence cannot be
retracted. Topic 04 governs notification submission, snooze and food reminder delivery.

#### #25 - Approved Last day rules (November 10, 2026)

The end date is called the **Last day** (GLOSSARY.md).

- The Last day is optional and included: its doses are expected; none from 00:00 the next day (D4).
- It can be set in first-time setup and in a schedule change, for Clock and Interval schedules. Setting, moving or removing it is a schedule change: a new Schedule version at the Edit time (D3). A change always states the Last day it wants; it is never copied over silently.
- A Last day must be today or later (Istanbul, at server confirmation) and on or after the start date or Anchor date. Stopping a schedule right now is stopping it (#218), not a past Last day.
- An **Ended schedule** (Last day passed) expects no more doses and keeps its earlier doses and outcomes. It restarts only through a change that moves the Last day to today or later or removes it; doses return only after the Edit time.
- Previews and next-dose summaries never show a dose after the Last day. Ending changes nothing on Today.

#### #218 - Approved stop rules (November 10, 2026)

See **Stop a schedule** (GLOSSARY.md).

- Stopping a schedule is a schedule change: a new Schedule version at the Edit time (D3). Occurrences due at or before it, and any later occurrence that already has an outcome, stay with the earlier version and can still be logged and corrected. None after it are expected.
- The stopped schedule is an **Ended schedule** dated the stop day (Istanbul). It restarts only through a schedule change with no Last day; occurrences return only after that change's Edit time.
- Any schedule not already Ended can be stopped, including one with a later Last day or one not yet started. Stopping an Ended schedule is rejected.
- Stopping cancels every unsent dose-related reminder for occurrences after the Edit time, including follow-ups, snoozes and food reminders.
- Previews and next-dose summaries never show a dose after the stop. Stopping changes nothing on Today. Logging intake without a schedule belongs to #28.

#### #26 - Approved pause and resume rules (November 12, 2026)

See **Pause a schedule** and **Resume a schedule** (GLOSSARY.md).

- Pausing a schedule is a schedule change: a new Schedule version at the Edit time (D3). Occurrences due at or before it, and any later occurrence that already has an outcome, stay with the earlier version and can still be logged and corrected. None are expected while paused, and none are made up later; paused days never show Not logged.
- Pause is open-ended until the user resumes. Any schedule not Ended or paused can be paused, including one with a later Last day or one not yet started. A paused schedule can be stopped (#218) but not changed. If its Last day passes while paused, it becomes an Ended schedule and can no longer be resumed.
- Resuming is a schedule change at its Edit time that keeps the routine, start date and Last day. A Clock schedule's first occurrence is its next set time after the Edit time, never before its start date. An Interval schedule requires a new Anchor of today or later. Resuming on the Last day is allowed even when no occurrence is left.
- Pausing suppresses pending dose-related reminders (topic 04). Refill alerts continue while paused (#10 D5). Previews and next-dose summaries never show a dose while paused.

#### Acceptance examples

All dates below are in 2026. Times are Europe/Istanbul. Notification rows
describe unsent reminders.

| Case                        | Input / timeline                                                                 | Expected result                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interval range              | X = 1, 7, 24 hours; X = 0, -1, 1.5, 25                                           | First three accepted; remaining values rejected (D1).                                                                                                                 |
| Midnight / late intake      | Anchor Nov 3 22:00, X = 7; first dose logged Taken at 23:15                      | Due Nov 3 22:00, Nov 4 05:00, 12:00, 19:00, Nov 5 02:00. Logging does not shift them.                                                                                 |
| Food range                  | Lead = 1, 30, 120 minutes; lead = 0, -1, 0.5, 121                                | First three accepted; remaining values rejected (D2).                                                                                                                 |
| Food midnight               | Nov 4 00:15 dose, 30-minute lead                                                 | Food target Nov 3 23:45. With quiet hours enabled it is dropped; dose stays 00:15.                                                                                    |
| Food expiry                 | Nov 3 09:00 dose, 30-minute lead; food job first processed at 09:00              | Food target was 08:30; now expired. Dose remains 09:00.                                                                                                               |
| Edit before due             | Old daily 09:00; C = Nov 3 08:59:59; change to 10:00                             | Old Nov 3 09:00 replaced and its pending reminders canceled; new Nov 3 10:00 expected (D3).                                                                           |
| Edit exactly due            | Same edit, C = Nov 3 09:00:00                                                    | Preserve old 09:00 occurrence and history; new 10:00 expected. Old follow-ups remain subject to normal cancellation and expiry (D3).                                  |
| Edit after due              | Same edit, C = Nov 3 09:00:01                                                    | Preserve 09:00; new 10:00 expected. Earlier Taken/Skipped remains unchanged (D3).                                                                                     |
| New time equals cutoff      | Old 10:00; C = Nov 3 09:00; change to daily 09:00                                | Old future 10:00 replaced; no new dose at C. First new dose Nov 4 09:00 (D3).                                                                                         |
| Final day                   | End Nov 3; daily 23:30                                                           | Nov 3 23:30 expected; Nov 4 23:30 absent. Pending +40 at Nov 4 00:10 and +80 at 00:50 canceled even with quiet hours disabled (D4).                                   |
| Exact end boundary          | End Nov 3; interval would fall Nov 4 00:00; pending snooze also targets 00:00    | Neither occurrence nor snooze send is allowed at the boundary (D4).                                                                                                   |
| End preserves history       | End Nov 3; unresolved Nov 3 23:30 dose; open history Nov 4                       | Dose remains Not logged and can later be logged/corrected; ending never marks it Skipped or Taken (D4).                                                               |
| Last day today              | At Nov 3 10:00, daily 09:00 and 21:00 with no end date; change Last day to Nov 3 | Preserve 09:00 and its history; 21:00 expected; Nov 4 absent; cancel remaining unsent dose-related reminders after the boundary (D3, D4). Last day Nov 2 is rejected. |
| Stop now                    | At Nov 3 14:00, daily 08:00 and 20:00 unlogged; stop                             | Preserve 08:00 as Not logged, still loggable; 20:00 and Nov 4 absent; Ended Nov 3; cancel unsent reminders after 14:00 (D3, #218).                                    |
| Stop keeps an early record  | Nov 3 20:00 logged Taken at 13:30; stop at 14:00                                 | 20:00 stays with its record on the earlier version (D3, #218).                                                                                                        |
| Stop before start           | Schedule starting Nov 5; stop at Nov 3 10:00                                     | No occurrences ever; Ended Nov 3 (#218).                                                                                                                              |
| Restart after stop          | Stopped Nov 3 14:00; change at Nov 4 10:00 to daily 08:00 and 20:00, no Last day | First occurrence Nov 4 20:00; Nov 3 20:00 and Nov 4 08:00 do not return (D3, #218).                                                                                   |
| Pause now                   | At Nov 3 14:00, daily 08:00 and 20:00 unlogged; pause                            | Preserve 08:00 as Not logged, still loggable; 20:00 and Nov 4 absent, never Not logged; paused since Nov 3 (D3, #26).                                                 |
| Pause keeps an early record | Nov 3 20:00 logged Taken at 13:30; pause at 14:00                                | 20:00 stays with its record on the earlier version (D3, #26).                                                                                                         |
| Last day while paused       | Last day Nov 10; paused Nov 5                                                    | From Nov 11 the schedule is Ended Nov 10, no longer paused, and cannot be resumed (#26).                                                                              |
| Stop while paused           | Paused Nov 3; stop Nov 4 10:00                                                   | Ended Nov 4; no occurrences between the pause and the stop (#218, #26).                                                                                               |
| Resume clock                | Daily 08:00 and 20:00 paused Nov 3 14:00; resume Nov 5 10:00                     | First occurrence Nov 5 20:00; nothing from Nov 3 20:00 through Nov 5 08:00 (#26).                                                                                     |
| Resume before start         | Daily 08:00 starting Nov 5; paused Nov 3; resume Nov 4                           | Start date kept; first occurrence Nov 5 08:00 (#26).                                                                                                                  |
| Resume on the Last day      | Last day Nov 3, daily 08:00; paused Nov 2; resume Nov 3 10:00                    | Resume accepted; no occurrence left; Ended from Nov 4 (#26).                                                                                                          |
| Resume interval             | Pause Nov 3 10:00; resume Nov 5 with new anchor 11:00 and X = 7                  | No paused-period doses; resumed sequence 11:00, 18:00, Nov 6 01:00.                                                                                                   |
| Travel                      | Daily 09:00 Istanbul; device changes to another timezone                         | Due instant stays tied to 09:00 Europe/Istanbul.                                                                                                                      |

## #10 - Approved low-stock transitions (November 3, 2026)

## Approved decisions

| ID  | Approved rule                                                                                                                                                                                                                                                                                                                                                                                                                       | Reason                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| D1  | For tracked, certain stock S and per-medicine threshold T, low means S < T. Equality is sufficient stock. A low episode starts on entry into low and ends when certain stock becomes S >= T.                                                                                                                                                                                                                                        | Matches the approved wording "below" and gives one exact boundary.                                   |
| D2  | Enabling tracking with an initially low count starts an episode immediately, with an in-app notice and one eligible refill push. Disabling tracking cancels unsent refill alerts and ends the episode; re-enabling evaluates the entered count afresh.                                                                                                                                                                              | Initial setup does not silently miss a warning.                                                      |
| D3  | Threshold edits evaluate the current certain count immediately. Non-low to low starts an episode; low to non-low ends it and cancels its unsent push; remaining low keeps the same episode and push budget.                                                                                                                                                                                                                         | Configurable thresholds take effect without repeated pushes for edits within low.                    |
| D4  | Refills, count corrections and resolved intake corrections use the same boundary. A refill that remains below T does not re-arm. Reaching T or above ends the episode; a later fall below T starts a new one. Retries apply each stock change once. During a conflict, show uncertain stock, suspend refill submission and preserve the episode/budget; evaluate the reconciled certain count once after resolution.                | Avoids double-counting and artificial episodes from provisional conflict counts.                     |
| D5  | Pause affects dose-related reminders only. Stock notices and refill pushes remain active while paused, including initial low counts, corrections and refills. Resume alone never creates a new low episode.                                                                                                                                                                                                                         | Inventory remains useful independently of the dose schedule.                                         |
| D6  | Each episode has one logical refill push, with no repeated push after submission or ambiguous acceptance. Known failed attempts may retry that same alert. With quiet hours enabled, defer at 23:00 inclusive until 08:00 exclusive Europe/Istanbul. At submission, recheck tracking, certain stock, current episode, budget and quiet hours. Recovery after 08:00 may submit the still-valid alert; never revive an ended episode. | Preserves one push per episode and overnight deferral without claiming exactly-once device delivery. |

The in-app low notice persists while certain stock is low even after its push.
Uncertain stock is presented as uncertain rather than a confident low/sufficient
count. No submission while uncertain consumes the push budget. Closing an episode
cancels unsent work; already submitted notifications cannot be retracted.
Thresholds and counts use the supported units, and stock consumption follows the
contract above. These decisions do not change dose pause, resume or course-end rules.

### Acceptance examples

All quantities are tablets unless stated. T = 5 except where specified. Times
are Europe/Istanbul, November 3-4, 2026. Push means submission eligibility, not
confirmed device receipt. Each row is independent unless its sequence says otherwise.

| Case                  | Input / timeline                                                       | Expected result                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equality              | S = 6; Taken 1; then Taken 0.5                                         | At 5 no low episode; at 4.5 start one, show notice, one push eligible.                                                                            |
| Initially low         | Enable at S = 4                                                        | Start episode and show notice immediately; one push eligible.                                                                                     |
| Initial equality      | Enable at S = 5                                                        | No low notice or push.                                                                                                                            |
| Threshold raised      | S = 5, T changes 5 to 6                                                | Enter low; one new episode and push.                                                                                                              |
| Edit within low       | S = 4, T changes 5 to 6 after push                                     | Same episode; no second push.                                                                                                                     |
| Threshold lowered     | S = 4, pending push; T changes 5 to 4                                  | End episode at equality; hide low notice and cancel pending push.                                                                                 |
| Partial refill        | S = 2, push submitted; refill +2                                       | S = 4 remains same episode; no second push.                                                                                                       |
| Refill re-arms        | S = 2; refill +3; then Taken 0.5                                       | At 5 end episode; at 4.5 start a new episode with one push.                                                                                       |
| Correction re-arms    | S = 4; correct count to 5; later correct to 4                          | End old episode, then start new episode; corrections obey the same boundary.                                                                      |
| Intake correction     | S = 5; Taken 1; correct to Skipped; later new Taken 1                  | 4 starts episode; restoring 5 ends it; later 4 starts a new episode. Retrying any action changes nothing further.                                 |
| Conflict              | S = 4 with pending push; Taken/Skipped conflict; resolve certain S = 4 | Suspend push while uncertain; resolution keeps same episode and its one pending alert. If already submitted, no new push.                         |
| Conflict recovery     | Existing low episode; conflict resolves certain S = 5                  | End episode and cancel its unsent alert. Never send based on provisional stock.                                                                   |
| Paused stock          | Paused medicine S = 2; refill +2, then +1; later correct to 4          | At 4 remain low; at 5 end episode; correction to 4 starts another, refill push eligible despite pause. No dose reminders or paused backlog added. |
| Resume                | Low episode already pushed while paused; resume                        | Keep same episode; no extra refill push. Dose resume rules remain unchanged.                                                                      |
| Quiet start           | Enter low at 23:00 with quiet hours enabled                            | Notice immediate; push deferred until Nov 4 08:00.                                                                                                |
| Morning equality      | Previous case; refill to 5 at 07:59                                    | End episode; no 08:00 push.                                                                                                                       |
| Still low morning     | Enter low at 23:30; still low at 08:00                                 | One push eligible at 08:00; further checks do not create another.                                                                                 |
| Replacement episode   | Low at 23:30; refill to 5 at 01:00; Taken 1 at 02:00                   | Old pending alert canceled; only new episode's alert eligible at 08:00.                                                                           |
| Delayed morning check | Low overnight; first recovery check 09:15; still low                   | Submit same episode's one pending alert, with current eligibility rechecked.                                                                      |
| Quiet hours disabled  | Enter low at 23:30; quiet hours disabled                               | Push immediately eligible.                                                                                                                        |
| Tracking toggle       | Low episode already pushed; disable, then re-enable with S = 4         | Cancel old pending work; re-enable starts a fresh episode with one push.                                                                          |
| Zero stock            | S = 0, T = 5; Taken 1 then Skipped                                     | Intake allowed; display remains 0 with correction prompt; same low episode, no extra push.                                                        |
| Capsule boundary      | Capsules, T = 5, S = 5; Taken 1 capsule                                | S = 4 starts low episode. No fractional capsule introduced.                                                                                       |
