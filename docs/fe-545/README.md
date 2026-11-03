# FE-545 - Clarify scheduling boundaries

Status: approved by Bora on November 3, 2026 in the implementation chat.
Approval: "I accept your recomemndations" in response to D1-D4 and the linked
rules/example draft. These decisions refine FE-539's explicit scheduling gaps.

Sources: [FE-545](https://linear.app/karacadev/issue/FE-545/clarify-scheduling-boundaries),
[FE-539](https://linear.app/karacadev/issue/FE-539/meddies-private-mvp-product-and-engineering-specification),
and canonical wiki topic 03 - Medication & Dose Domain.

## Preserved approved rules

- All examples use Europe/Istanbul, including when the device travels.
- Daily and selected-weekday schedules use local clock times. Intervals use
  elapsed hours from an explicit first date/time, continuing across midnight.
- Actual intake time is separate from due time. Late logging never moves recurrence.
- Edits preserve earlier expectations and records; corrections are separate.
- Paused periods produce no expected doses or backlog. Clock resume uses the next
  configured time; interval resume requires a new anchor.
- An end date includes its final local calendar day for occurrence generation.
- Quiet hours, outcome cancellation, next-occurrence supersession and bounded
  follow-ups retain their FE-539 behavior. Submitted pushes cannot be retracted.

## Approved decisions

| ID  | Approved rule                                                                                                                                                                                                                                                                                                                             | Rationale                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Every X hours accepts whole hours from 1 through 24, inclusive. Reject fractions, zero, negative values and values above 24.                                                                                                                                                                                                              | Simple bounded MVP input; includes non-divisors of 24 without changing elapsed recurrence. This is input scope, not dosage advice. |
| D2  | Enabled food reminders accept whole minutes from 1 through 120, inclusive. Disabled is separate from zero. Reject fractions and values outside the range.                                                                                                                                                                                 | Allows precise user-entered heads-up timing with a bounded window; no clinically chosen default.                                   |
| D3  | Let C be the server-confirmed edit effective instant. Preserve old occurrences with due time <= C, including their identity and records. Replace only occurrences due > C; new-version occurrences must also be due > C. Cancel unsent reminders tied to replaced occurrences. Retained occurrences retain existing reminder eligibility. | Equality belongs to the already-due dose, independent of scheduler processing order. No duplicate dose at C.                       |
| D4  | End date E stops both new occurrences and all unsent dose-related reminders at 00:00 on E + 1 day in Europe/Istanbul. Includes automatic follow-ups, explicit snoozes and food reminders. Preserve every earlier occurrence and record for logging/correction.                                                                            | Makes the course end a clear stop boundary; avoids reminders continuing into the next day. No refill-policy change.                |

An edit changing the end date still follows D3: it cannot erase an already-due
occurrence. D4 suppresses its remaining sends if the new end boundary has passed.
Food reminders already submitted for a replaced future occurrence cannot be
retracted. Delayed-job coalescing, snooze timing details and other FE-539 gaps
outside D1-D4 remain with their owning clarification tickets.

## Acceptance examples

All dates below are in 2026. Times are Europe/Istanbul. Notification rows
describe unsent reminders.

| Case                   | Input / timeline                                                              | Expected result                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Interval range         | X = 1, 7, 24 hours; X = 0, -1, 1.5, 25                                        | First three accepted; remaining values rejected (D1).                                                                                |
| Midnight / late intake | Anchor Nov 3 22:00, X = 7; first dose logged Taken at 23:15                   | Due Nov 3 22:00, Nov 4 05:00, 12:00, 19:00, Nov 5 02:00. Logging does not shift them.                                                |
| Food range             | Lead = 1, 30, 120 minutes; lead = 0, -1, 0.5, 121                             | First three accepted; remaining values rejected (D2).                                                                                |
| Food midnight          | Nov 4 00:15 dose, 30-minute lead                                              | Food target Nov 3 23:45. With quiet hours enabled it is dropped; dose stays 00:15.                                                   |
| Food expiry            | Nov 3 09:00 dose, 30-minute lead; food job first processed at 09:00           | Food target was 08:30; now expired. Dose remains 09:00.                                                                              |
| Edit before due        | Old daily 09:00; C = Nov 3 08:59:59; change to 10:00                          | Old Nov 3 09:00 replaced and its pending reminders canceled; new Nov 3 10:00 expected (D3).                                          |
| Edit exactly due       | Same edit, C = Nov 3 09:00:00                                                 | Preserve old 09:00 occurrence and history; new 10:00 expected. Old follow-ups remain subject to normal cancellation and expiry (D3). |
| Edit after due         | Same edit, C = Nov 3 09:00:01                                                 | Preserve 09:00; new 10:00 expected. Earlier Taken/Skipped remains unchanged (D3).                                                    |
| New time equals cutoff | Old 10:00; C = Nov 3 09:00; change to daily 09:00                             | Old future 10:00 replaced; no new dose at C. First new dose Nov 4 09:00 (D3).                                                        |
| Final day              | End Nov 3; daily 23:30                                                        | Nov 3 23:30 expected; Nov 4 23:30 absent. Pending +40 at Nov 4 00:10 and +80 at 00:50 canceled even with quiet hours disabled (D4).  |
| Exact end boundary     | End Nov 3; interval would fall Nov 4 00:00; pending snooze also targets 00:00 | Neither occurrence nor snooze send is allowed at the boundary (D4).                                                                  |
| End preserves history  | End Nov 3; unresolved Nov 3 23:30 dose; open history Nov 4                    | Dose remains Not logged and can later be logged/corrected; ending never marks it Skipped or Taken (D4).                              |
| Shortened end          | At Nov 3 23:40, change end date to Nov 2                                      | Preserve already-due history; remove future expectations and cancel all remaining unsent dose-related reminders (D3, D4).            |
| Resume interval        | Pause Nov 3 10:00; resume Nov 5 with new anchor 11:00 and X = 7               | No paused-period doses; resumed sequence 11:00, 18:00, Nov 6 01:00.                                                                  |
| Travel                 | Daily 09:00 Istanbul; device changes to another timezone                      | Due instant stays tied to 09:00 Europe/Istanbul.                                                                                     |

## Evidence and scope

The table is the focused acceptance evidence for this documentation outcome.
The 7-hour timeline crosses midnight without shifting after late logging;
the edit cases cover before/equal/after cutoff; final-day cases cover follow-ups,
snooze equality and retained history. Values at and outside both input ranges
are explicit. No unresolved blocker remains within D1-D4.

Canonical publication: [03 - Medication & Dose Domain](https://linear.app/karacadev/document/meddies-03-medication-and-dose-domain-01d40542d5e8),
section "FE-545 - Approved scheduling boundaries (November 3, 2026)".
The documentation index links to that section. FE-545 records the approval,
evidence and publication links.

No scheduling feature is implemented here. TDD and runtime test seams do not
apply to these product decisions. Existing experiment typechecks and test suites
are run as repository regression checks; they do not prove scheduling behavior.

All three experiment typechecks and full test scripts passed (FE-541, FE-542,
FE-544). Captured output is alongside this file in `typecheck-fe-*.txt` and
`test-fe-*.txt`. Canonical wiki read-back confirmed D1-D4 and all 15 table rows;
index read-back confirmed the new navigation entry. Linear normalizes Markdown
list markers and link formatting on save.

## Review

Reviewed against starting commit `52eda38891b4d7c88c4e6b670a5c589becc44735`
using the code-review skill's independent standards and spec reviewers.

- Standards: 0 findings. No documented-standard violations or actionable smells.
- Spec: 0 findings. All approved boundary decisions and requested evidence covered.
