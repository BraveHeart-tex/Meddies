# FE-547 - Clarify low-stock transitions

Status: approved by Bora on November 3, 2026 in the implementation chat.
Approval: "Accepted" in response to D1-D6 and all 23 examples.
Stock implementation remains with downstream tickets.

Sources: [FE-547](https://linear.app/karacadev/issue/FE-547/clarify-low-stock-transitions),
[FE-539](https://linear.app/karacadev/issue/FE-539/meddies-private-mvp-product-and-engineering-specification),
[03 - Medication & Dose Domain](https://linear.app/karacadev/document/meddies-03-medication-and-dose-domain-01d40542d5e8),
[04 - Notifications & Reminder Delivery](https://linear.app/karacadev/document/meddies-04-notifications-and-reminder-delivery-b9d4d29de56e).

## Approved decisions

| ID | Approved rule | Reason |
| -- | -- | -- |
| D1 | For tracked, certain stock S and per-medicine threshold T, low means S < T. Equality is sufficient stock. A low episode starts on entry into low and ends when certain stock becomes S >= T. | Matches the approved wording "below" and gives one exact boundary. |
| D2 | Enabling tracking with an initially low count starts an episode immediately, with an in-app notice and one eligible refill push. Disabling tracking cancels unsent refill alerts and ends the episode; re-enabling evaluates the entered count afresh. | Initial setup does not silently miss a warning. |
| D3 | Threshold edits evaluate the current certain count immediately. Non-low to low starts an episode; low to non-low ends it and cancels its unsent push; remaining low keeps the same episode and push budget. | Configurable thresholds take effect without repeated pushes for edits within low. |
| D4 | Refills, count corrections and resolved intake corrections use the same boundary. A refill that remains below T does not re-arm. Reaching T or above ends the episode; a later fall below T starts a new one. Retries apply each stock change once. During a conflict, show uncertain stock, suspend refill submission and preserve the episode/budget; evaluate the reconciled certain count once after resolution. | Avoids double-counting and artificial episodes from provisional conflict counts. |
| D5 | Pause affects dose-related reminders only. Stock notices and refill pushes remain active while paused, including initial low counts, corrections and refills. Resume alone never creates a new low episode. | Inventory remains useful independently of the dose schedule. |
| D6 | Each episode has one logical refill push, with no repeated push after submission or ambiguous acceptance. Known failed attempts may retry that same alert. With quiet hours enabled, defer at 23:00 inclusive until 08:00 exclusive Europe/Istanbul. At submission, recheck tracking, certain stock, current episode, budget and quiet hours. Recovery after 08:00 may submit the still-valid alert; never revive an ended episode. | Preserves one push per episode and overnight deferral without claiming exactly-once device delivery. |

The in-app low notice persists while certain stock is low even after its push.
Uncertain stock is presented as uncertain rather than a confident low/sufficient
count. No submission while uncertain consumes the push budget. Closing an episode
cancels unsent work; already submitted notifications cannot be retracted.
Thresholds and counts retain the supported whole/half-tablet and whole-capsule
units. Taken consumes quantity, Skipped consumes nothing, and zero stock never
blocks intake. Displayed counts stay non-negative and discrepancies prompt
correction. These decisions do not change dose pause, resume or course-end rules.

## Acceptance examples

All quantities are tablets unless stated. T = 5 except where specified. Times
are Europe/Istanbul, November 3-4, 2026. Push means submission eligibility, not
confirmed device receipt. Each row is independent unless its sequence says otherwise.

| Case | Input / timeline | Expected result |
| -- | -- | -- |
| Equality | S = 6; Taken 1; then Taken 0.5 | At 5 no low episode; at 4.5 start one, show notice, one push eligible. |
| Initially low | Enable at S = 4 | Start episode and show notice immediately; one push eligible. |
| Initial equality | Enable at S = 5 | No low notice or push. |
| Threshold raised | S = 5, T changes 5 to 6 | Enter low; one new episode and push. |
| Edit within low | S = 4, T changes 5 to 6 after push | Same episode; no second push. |
| Threshold lowered | S = 4, pending push; T changes 5 to 4 | End episode at equality; hide low notice and cancel pending push. |
| Partial refill | S = 2, push submitted; refill +2 | S = 4 remains same episode; no second push. |
| Refill re-arms | S = 2; refill +3; then Taken 0.5 | At 5 end episode; at 4.5 start a new episode with one push. |
| Correction re-arms | S = 4; correct count to 5; later correct to 4 | End old episode, then start new episode; corrections obey the same boundary. |
| Intake correction | S = 5; Taken 1; correct to Skipped; later new Taken 1 | 4 starts episode; restoring 5 ends it; later 4 starts a new episode. Retrying any action changes nothing further. |
| Conflict | S = 4 with pending push; Taken/Skipped conflict; resolve certain S = 4 | Suspend push while uncertain; resolution keeps same episode and its one pending alert. If already submitted, no new push. |
| Conflict recovery | Existing low episode; conflict resolves certain S = 5 | End episode and cancel its unsent alert. Never send based on provisional stock. |
| Paused stock | Paused medicine S = 2; refill +2, then +1; later correct to 4 | At 4 remain low; at 5 end episode; correction to 4 starts another, refill push eligible despite pause. No dose reminders or paused backlog added. |
| Resume | Low episode already pushed while paused; resume | Keep same episode; no extra refill push. Dose resume rules remain unchanged. |
| Quiet start | Enter low at 23:00 with quiet hours enabled | Notice immediate; push deferred until Nov 4 08:00. |
| Morning equality | Previous case; refill to 5 at 07:59 | End episode; no 08:00 push. |
| Still low morning | Enter low at 23:30; still low at 08:00 | One push eligible at 08:00; further checks do not create another. |
| Replacement episode | Low at 23:30; refill to 5 at 01:00; Taken 1 at 02:00 | Old pending alert canceled; only new episode's alert eligible at 08:00. |
| Delayed morning check | Low overnight; first recovery check 09:15; still low | Submit same episode's one pending alert, with current eligibility rechecked. |
| Quiet hours disabled | Enter low at 23:30; quiet hours disabled | Push immediately eligible. |
| Tracking toggle | Low episode already pushed; disable, then re-enable with S = 4 | Cancel old pending work; re-enable starts a fresh episode with one push. |
| Zero stock | S = 0, T = 5; Taken 1 then Skipped | Intake allowed; display remains 0 with correction prompt; same low episode, no extra push. |
| Capsule boundary | Capsules, T = 5, S = 5; Taken 1 capsule | S = 4 starts low episode. No fractional capsule introduced. |

## Approval and verification

Bora approved D1-D6 and all 23 examples with "Accepted" on November 3, 2026.
No unresolved product blocker remains within FE-547. The examples cover
threshold equality, initial stock, threshold edits, episode re-arming, paused
medicines, conflicts, idempotency and overnight deferral.

Canonical publication: wiki topic 03, section "FE-547 - Approved low-stock
transitions (November 3, 2026)"; linked from topic 04 and the documentation index.

This is a documentation outcome. There is no runtime seam for TDD; approved
concrete examples are the ticket's requested acceptance evidence. No code,
typecheck or test result can substitute for the required product approval.

All three experiment typechecks and full test scripts passed (FE-541, FE-542,
FE-544). Outputs are alongside this file. These regression checks do not prove
stock behavior. Canonical wiki read-back verified the complete approved section
and both navigation entries, allowing only Linear's Markdown link normalization.

## Review

Used the code-review skill with independent standards and spec reviewers against
starting commit `ce7a8961d7e377fa8d53669573d0d27b57b6473b`. Both read the complete
new file because it was untracked at review time.

- Standards: 0 findings; no documented-standard violations or applicable smells.
- Spec: 0 findings; all approved decisions and 23 examples covered.
- Publication and regression checks verified separately after review.
