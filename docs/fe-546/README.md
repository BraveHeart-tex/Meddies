# FE-546 - Clarify snooze and delayed-reminder boundaries

Status: approved by Bora on November 3, 2026 in the implementation chat.
Approval: "accept" in response to the linked D1-D5 draft and recommendations.
These decisions resolve FE-546's reminder-policy gaps. Scheduler implementation
remains with the downstream tickets.

Sources: [FE-546](https://linear.app/karacadev/issue/FE-546/clarify-snooze-and-delayed-reminder-boundaries),
[FE-539](https://linear.app/karacadev/issue/FE-539/meddies-private-mvp-product-and-engineering-specification),
[04 - Notifications & Reminder Delivery](https://linear.app/karacadev/document/meddies-04-notifications-and-reminder-delivery-b9d4d29de56e),
and [approved FE-545 boundaries](../fe-545/README.md).

## Preserved rules

- Two follow-up slots per occurrence, initially due at +40 and +80 minutes.
- Snooze is online, server-confirmed and targets confirmation time +40 minutes.
- Only an explicit snooze may extend the ordinary +80-minute expiry.
- Quiet hours are optional, 23:00 inclusive to 08:00 exclusive Europe/Istanbul.
  Originals remain; follow-ups, snoozes and food targets inside quiet hours drop.
  Dropped slots never replenish.
- Synced Taken/Skipped, conflict, pause and the next same-medicine occurrence
  suppress pending sends. FE-545's course-end cutoff also applies to snoozes.
- Provider acceptance is neither guaranteed receipt nor intake. Submitted pushes
  cannot be retracted. Logging and recurrence remain independent of reminders.

## Approved decisions

| ID  | Approved rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Reason                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Snooze reserves the earliest unused follow-up slot. Each slot can be reserved once; it cannot be snoozed repeatedly. Submitted, dropped, coalesced or reserved slots are unavailable. Distinct concurrent requests cannot reserve the same slot; retries of one confirmed request return that same result. Reject a second snooze while a confirmed snooze is pending.                                                                                                               | Keeps the two-slot budget real and avoids repeatedly moving one reminder indefinitely.                                                            |
| D2  | After an intermediate snooze, move the remaining automatic slot to 40 minutes after the snooze target. If that automatic target exceeds dose time +80 minutes, retire it. Only the explicitly reserved slot gets an extension.                                                                                                                                                                                                                                                       | Avoids an automatic nudge shortly after the requested snooze without extending automatic expiry.                                                  |
| D3  | Accept a new snooze only from dose due time through ordinary +80 minutes inclusive, with an unused slot and no pending snooze or suppression. After expiry or exhaustion, snooze is unavailable. A previously confirmed snooze remains eligible under D5.                                                                                                                                                                                                                            | The extension exception honors an explicit request made while the dose reminder window is active; it does not revive expired doses.               |
| D4  | For one occurrence, evaluate suppressions and expiry first, then submit at most the eligible reminder with the latest target at or before processing time. Retire all older due jobs for that occurrence, including their slots. Keep future eligible jobs. A valid pending snooze suppresses automatic sends until its target; superseded earlier jobs cannot leak through. Automatic jobs may send only at or before +80 minutes, including equality; later processing drops them. | Recovery produces one current reminder rather than stale catch-up bursts. Cadence stays anchored to targets, not delayed submission time.         |
| D5  | A confirmed snooze may be submitted from its target through target +5 minutes inclusive; later processing drops it and consumes the slot. This is server submission eligibility, not a device-arrival guarantee. Check quiet hours at both target and submission; if either is inside quiet hours, drop the follow-up. Apply the same submission-time quiet-hour check to delayed automatic follow-ups. No deferral to morning.                                                      | Gives a short, bounded recovery window beyond the normal minute-scale check without sending an old snooze much later or interrupting quiet hours. |

Before accepting a snooze, evaluate already-due expired or quiet-hour-dropped
slots using the same rules as scheduler processing. Request ordering must not
resurrect a slot that should already be retired. Future slots targeted inside
quiet hours are also unavailable for replacement. A snooze target inside quiet
hours is accepted with a clear dropped/no-reminder result and consumes its slot;
it must not promise a reminder at that time.

## Acceptance timelines

All times November 3, 2026, Europe/Istanbul unless stated otherwise. Quiet hours
are disabled except in named quiet-hour cases. Sends mean unsent-job submission
eligibility; all doses remain unconfirmed unless specified.

| Case                       | Timeline                                                                                            | Expected result                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Baseline                   | Dose 09:00, timely checks                                                                           | Original 09:00; automatic slots 09:40 and 10:20.                                                              |
| Intermediate snooze        | Dose 09:00; confirm snooze 09:20                                                                    | Slot 1 targets 10:00. Slot 2 would move to 10:40, beyond ordinary expiry, so retires. No 09:40 or 10:20 send. |
| Immediate snooze           | Dose 09:00; confirm snooze 09:00                                                                    | Slot 1 targets 09:40; slot 2 stays 10:20.                                                                     |
| Final-slot extension       | Dose 09:00; slot 1 submitted 09:40; snooze 10:10                                                    | Slot 2 targets 10:50; original 10:20 target replaced.                                                         |
| Exact expiry request       | Dose 09:00; slot 1 submitted; slot 2 unused; snooze confirmed 10:20 before submission wins the slot | Target 11:00 accepted. If slot 2 submission wins first, reject snooze as exhausted.                           |
| After ordinary expiry      | Same dose; request at 10:20:01                                                                      | Reject new snooze even if scheduler has not processed slot 2. Existing confirmed extension can still run.     |
| Exhausted budget           | Both slots submitted or dropped; request 10:00                                                      | Reject; no third slot.                                                                                        |
| Pending snooze             | Snooze confirmed 09:20 for 10:00; distinct request 09:30                                            | Reject second pending snooze; retry of original returns 10:00.                                                |
| Delayed recovery           | No submissions for 09:00 dose; first check 10:05                                                    | Submit only 09:40 slot; retire original. Keep future 10:20 slot.                                              |
| Exact automatic cutoff     | No submissions; first check 10:20                                                                   | Submit only 10:20 slot; retire original and 09:40 slot.                                                       |
| Past automatic cutoff      | No submissions; first check 10:20:01                                                                | Drop all automatic jobs; no catch-up. The strict cutoff may lose the final slot to check jitter.              |
| Snooze lateness            | Confirm 10:10, target 10:50; process 10:55 or 10:55:01                                              | Submit at 10:55; drop at 10:55:01. No slot replenishment.                                                     |
| Pending snooze recovery    | Confirm 09:20 for 10:00; check 09:50 then 10:04                                                     | No automatic 09:40 send; one snooze send 10:04.                                                               |
| Quiet target               | Dose 22:00; slot 1 unused; snooze confirmed 22:30                                                   | Slot 1 target 23:10 drops and consumes slot; no morning deferral. Slot 2 also retires.                        |
| Quiet crossing             | Snooze targets 22:59; process 23:01                                                                 | Drop despite being inside the five-minute tolerance. Target 08:00 is outside quiet hours; 23:00 is inside.    |
| Quiet slot unavailable     | Dose 22:00; slot 1 submitted; request 22:50; automatic slot 2 targets 23:20                         | Slot 2 is already disqualified by quiet hours; reject snooze.                                                 |
| Next dose equality         | Old snooze targets 10:50; next same-medicine dose due 10:50                                         | Suppress old snooze at equality; new occurrence is independent.                                               |
| Outcome / conflict / pause | Snooze targets 10:50; relevant suppression reaches server 10:49                                     | Cancel pending snooze. Already submitted pushes may still arrive.                                             |
| Course end                 | End Nov 3; snooze targets Nov 4 00:00                                                               | Cancel at course-end boundary, even with quiet hours disabled.                                                |

## Evidence and scope

Bora approved D1-D5 and all 19 timelines with "accept" on November 3, 2026.
The timelines cover intermediate timing, both slot limits, post-expiry rejection,
exact automatic cutoff, delayed-job coalescing, explicit extension and its
five-minute tolerance, quiet hours and overriding cancellation boundaries.
No unresolved product blocker remains within FE-546.

Canonical publication: [04 - Notifications & Reminder Delivery](https://linear.app/karacadev/document/meddies-04-notifications-and-reminder-delivery-b9d4d29de56e),
section "FE-546 - Approved snooze and delayed-reminder boundaries (November 3, 2026)".
The documentation index links to that section. FE-546 records the approval,
publication and evidence.

This is a documentation outcome. TDD has no runtime seam here. Existing
experiment tests cannot prove reminder semantics; approved timelines are the
focused acceptance evidence requested by the ticket.

All three experiment typechecks and full test scripts passed (FE-541, FE-542,
FE-544). Captured output is alongside this file in `typecheck-fe-*.txt` and
`test-fe-*.txt`. FE-541 and FE-542 required loopback access outside the sandbox
for their local test servers. Canonical wiki read-back verified all 19 timeline
rows; the index read-back verified the FE-546 navigation entry.

## Review

Reviewed the new documentation against starting commit
`22044640430e6bc475daa59d4860ab74d16ecd8a` using the code-review skill's
independent standards and spec reviewers. Because the new file was untracked
at review time, both reviewers read its complete contents as the added diff.
Publication read-back and regression checks were verified separately afterward.

- Standards: 0 findings. No documented-standard violations or applicable smells.
- Spec: 0 findings. All approved boundary decisions and requested timelines covered.
