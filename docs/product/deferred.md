# Deferred scope

Approved rules that [FE-620](https://github.com/BraveHeart-tex/Meddies/issues/82) deferred beyond MVP on
November 6, 2026. Build them only when an issue brings them back into scope; current behavior is in
[02 - UX & User Journeys](./ux-journeys.md#current-online-and-session-interaction-contract---november-6-2026).

## [FE-548](https://github.com/BraveHeart-tex/Meddies/issues/11) - Offline availability

### Approved decisions

| ID  | Approved rule                                                                                                                                                                                                                                                                                                                                                  | Reason                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| D1  | After a successful online refresh on date D in Europe/Istanbul, cache history for the 30 preceding calendar days plus elapsed events today. Include scheduled occurrences/outcomes and unscheduled intake. Older history stays on the server until user deletion and requires internet to load.                                                                | A bounded, useful offline review window without changing server retention.                         |
| D2  | Cache scheduled occurrences for today D through D+6 inclusive, including elapsed occurrences today. Show the last successful refresh time and exact cached dates. Only successful refresh advances coverage; midnight or reopening alone never extends it.                                                                                                     | Seven explicit calendar dates, without a local recurrence engine.                                  |
| D3  | Allow offline unscheduled Taken for an already cached medicine, with actual intake time and supported quantity. Persist with a stable action ID and Waiting to sync. Do not create a scheduled occurrence, shift reminders or silently merge separate intakes. New medicine setup remains online-only.                                                         | Occasional intake can be recorded during connectivity loss using the same durable action boundary. |
| D4  | Outside cached dose/history coverage, show Not available offline and Connect to refresh, with the available date range. Never display an empty result as No doses or invent Not logged occurrences. Cached medicine details remain available; D3 logging remains available even after the dose horizon ends.                                                   | Distinguishes missing data from a genuinely empty schedule.                                        |
| D5  | Before first successful online sign-in/refresh, show Connect to set up Meddies; no medicine/dose data or offline intake controls. A previously cached but genuinely empty day may show No scheduled doses within its known coverage. If cache is lost, show unavailable state rather than reconstructing a routine.                                            | Initial setup requires server-confirmed identity and data.                                         |
| D6  | History-window pruning must not discard pending actions or unresolved conflicts, even when older than 30 days. Keep them visible separately until acknowledged/resolved; exclude them from any claim of confirmed server history. Setup, schedule edits and snooze remain online and server-confirmed. No local reminder engine or guaranteed closed-app sync. | A display-retention boundary must not lose unconfirmed work.                                       |

Offline views are snapshots, not confirmation that another device has made no
changes. Show pending outcomes as Waiting to sync and explain that reminders may
continue until the server receives them. A failed refresh preserves the previous
coverage and pending work; it never reports a newly complete snapshot.

Sync runs when connectivity and app execution allow, including after reopening.
Retries reuse the original action ID and have no repeated outcome/stock effect.
Genuine conflicts preserve both submissions for user resolution. Once the server
knows of a Taken/Skipped conflict, suppress that occurrence's unsent dose reminders
and mark affected stock uncertain; an offline-only client cannot cancel server
work. Stock reconciliation occurs once after resolution. Supported units remain
whole/half tablets and whole capsules. Pending stock is not a confirmed server count.

### Acceptance examples

Times and dates use Europe/Istanbul. Refresh is successful unless stated otherwise.

| Case                   | Input / timeline                                   | Expected result                                                                                                                                  |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| History start          | Refresh Nov 3, 2026 at 10:00                       | History covers Oct 4 through elapsed Nov 3; Oct 3 requires internet. Server history is not deleted.                                              |
| Dose coverage          | Same refresh                                       | Cached dose dates Nov 3-9 inclusive, including elapsed Nov 3 occurrences. Nov 10 unavailable offline.                                            |
| Midnight               | Stay offline through Nov 4                         | Original Nov 3-9 dose coverage remains; Nov 10 is not generated locally.                                                                         |
| Horizon exhausted      | Reopen offline Nov 10                              | Today says Not available offline, shows last refresh/coverage and Connect to refresh. Cached medicines and unscheduled logging remain available. |
| Known empty day        | Nov 7 cached with no occurrences                   | No scheduled doses for Nov 7; no such claim for uncached Nov 10.                                                                                 |
| Initial offline launch | No successful online sign-in/refresh               | Connect to set up Meddies; no offline medicine setup or intake logging.                                                                          |
| Cache lost             | Previously used app, local cache absent, offline   | Data unavailable offline; reconnect required. No reconstruction or recovered-action claim.                                                       |
| Scheduled action       | Cached Nov 3 12:00 dose; Taken offline 12:05       | Persist actual time and supported quantity as Waiting to sync; scheduled future times unchanged.                                                 |
| Skipped                | Cached occurrence; Skipped offline                 | Waiting to sync; no stock consumption.                                                                                                           |
| Unscheduled intake     | Cached medicine; Taken 0.5 tablet offline at 14:10 | Pending unscheduled record with stable ID; no occurrence, follow-up or schedule shift created.                                                   |
| Uncached medicine      | Offline, medicine absent from cache                | Cannot create medicine or record an unscheduled intake against an unknown medicine; reconnect required.                                          |
| Replay                 | Reopen and retry one pending action twice          | Same ID; one resulting record and one stock effect, once acknowledged.                                                                           |
| Separate intakes       | Explicit unscheduled Taken at 14:10 and 18:10      | Separate action IDs and records; no deduplication merely by medicine/date.                                                                       |
| Retention rollover     | Pending Oct 4 action; refresh Nov 4                | Normal history begins Oct 5; Oct 4 pending action remains visible until acknowledged/resolved.                                                   |
| Conflict rollover      | Unresolved conflict ages beyond history window     | Both submissions remain available for resolution; stock remains uncertain, eligible dose reminders suppressed once server knows.                 |
| Closed app             | Taken offline; close PWA; restore connection       | No promised sync while closed; server reminders may continue. Reopening with connectivity permits retry and acknowledgement.                     |
| Failed refresh         | Nov 3 snapshot; refresh Nov 5 fails                | Keep Nov 3-9 coverage and pending actions; show failed refresh, no extension to Nov 11.                                                          |
| Successful refresh     | Refresh Nov 5                                      | Dose coverage Nov 5-11; history Oct 6 through elapsed Nov 5, plus separately retained pending/conflict work.                                     |
| Online-only actions    | Offline setup, schedule edit or snooze attempt     | Explain internet/server confirmation required; no applied change or successful snooze shown.                                                     |
