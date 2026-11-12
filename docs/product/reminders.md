# 04 - Notifications & Reminder Delivery

## User promise

Never forget a dose. Reminders should be **proactive, configurable, persistent enough to be useful and trustworthy**, including when the PWA is closed wherever the platform allows.

Reminder configuration and confirmed dose history are separate. A notification being sent or clicked does **not** mean the dose was taken.

## Current preferred technical direction

- Backend-scheduled delivery through a Cloudflare Workers/Cron-oriented service.
- **Firebase Cloud Messaging (FCM)** is the currently preferred push direction, replacing earlier reliance on web push alone.
- Email reminder fallback is outside the approved private MVP; it requires a separate scope decision if push feasibility fails.
- iPhone Home Screen PWA notification behavior is a mandatory feasibility spike before committing to the reminder architecture.

The iOS PWA delivery path, service worker integration and actual behavior on target devices are **unvalidated**. FCM preference does not prove that all platform push requirements or reliability guarantees are met.

## Required scenarios to investigate

| Scenario                   | Verification focus                                       |
| -------------------------- | -------------------------------------------------------- |
| PWA open                   | In-app dose status and reminder UX                       |
| PWA closed/backgrounded    | Arrival and action behavior on iPhone and Android        |
| First-time install         | Permission and Home Screen installation requirements     |
| Push denied or revoked     | Clear guidance and fallback behavior                     |
| Offline or delayed service | Retries, duplicate prevention and eventual status        |
| User confirms a dose       | Suppress or reconcile subsequent reminders               |
| User misses a reminder     | Configurable follow-up behavior; confirm platform limits |

## Non-negotiable design distinction

Separate the **scheduled dose**, **delivery attempt**, **provider acknowledgement**, **device display**, and **actual user confirmation**. Do not represent any upstream delivery event as proof of medication intake.

## Reminder Policy - Approved Contract

### Scheduled and follow-up dose reminders

- A backend scheduler operates without an open PWA and checks roughly once per minute; actual provider/device arrival may be later. Original reminders target the scheduled due instant, even inside enabled quiet hours.
- Automatic follow-up targets are +40 and +80 minutes from scheduled due time, with **two total slots**. No automatic send after +80 minutes; at the equality boundary the final slot may still submit. Late processing coalesces eligible jobs rather than bursting stale reminders.
- An online, server-confirmed 40-minute **snooze** reserves an available follow-up slot, never adds a third one. Only an explicitly confirmed snooze may extend normal +80 expiry; the exact slot, coalescing and five-minute submission rules are governed by [FE-546](https://github.com/BraveHeart-tex/Meddies/issues/9) below.

### Suppression, quiet hours and expiry

- Optional quiet hours run 23:00 inclusive to 08:00 exclusive, Europe/Istanbul. Original dose reminders still target their chosen times; follow-ups, snoozes and food reminders targeted inside quiet hours are **dropped**, not queued for morning. Dropped slots do not replenish.
- Stop future unsent dose and associated food reminders after the server receives Taken/Skipped. A server-known conflict, pause and a newer same-medicine occurrence also suppress the older pending sends; the old occurrence remains in history. Optimistic/unconfirmed changes do not establish server receipt and cannot establish reminder cancellation. Offline writes are deferred; reminders may continue until an online action reaches the server.
- At 00:00 Europe/Istanbul after a course's inclusive final day, no further occurrence or unsent dose-related reminder (including food and snooze) may be sent. Preserve already-due history; see [FE-545](https://github.com/BraveHeart-tex/Meddies/issues/8) in [03 - Medication & Dose Domain](./medication-domain.md).
- Submitted notifications cannot be recalled. Provider acceptance is not confirmed user receipt, and neither delivery nor tapping confirms medication ingestion.

### Food reminders, refill and privacy

- An optional per-medicine food heads-up uses a user-specified whole-minute lead of **1-120** before each dose; disabled is distinct from zero. One heads-up only; no follow-ups, meal logging or dose-time movement. Drop at dose time, in quiet hours, or after early confirmed Taken/Skipped.
- Refill pushes follow the [FE-547](https://github.com/BraveHeart-tex/Meddies/issues/10) per-medicine low-stock episode budget in topic 03. They are **not stopped by dose pause**; quiet-hour deferral rechecks the current eligible episode at 08:00 or later rather than sending stale work.
- Use generic lock-screen notification text by default; displaying medicine names (including refill alerts) requires explicit user opt-in.
- Recheck expiration, cancellation, preferences and eligibility before submission. Record intended sends and delivery attempts separately. Do not claim exactly-once push receipt, silent iOS background execution or Focus bypass.

Email delivery/fallback is **outside the approved MVP**; it is not a mandatory push alternative.

## Remaining delivery and integration decisions

**Still unverified:** real installed/closed/locked iPhone Home Screen PWA delivery with FCM ([FE-543](https://github.com/BraveHeart-tex/Meddies/issues/6)), token lifecycle, reinstallation/revocation, device navigation, Focus/OS limitations, exact production provider credentials and operational monitoring. Standard Web Push is an approved fallback candidate if real-device FCM evidence requires it.

**Settled:** original/+40/+80 cadence, two-slot snooze and delayed-job behavior ([FE-546](https://github.com/BraveHeart-tex/Meddies/issues/9) below), privacy-default notification content, quiet-hour treatment and the per-medicine food reminder lead range ([FE-545](https://github.com/BraveHeart-tex/Meddies/issues/8) in topic 03). The precise copy and device-settings UX remain design work within these rules.

## FE-546 - Approved snooze and delayed-reminder boundaries (November 3, 2026)

These rules override earlier proposals in this topic for cadence, snooze and delayed jobs.

### Preserved rules

- Two follow-up slots per occurrence, initially due at +40 and +80 minutes.
- Snooze is online, server-confirmed and targets confirmation time +40 minutes.
- Only an explicit snooze may extend the ordinary +80-minute expiry.
- Quiet hours are optional, 23:00 inclusive to 08:00 exclusive Europe/Istanbul.
  Originals remain; follow-ups, snoozes and food targets inside quiet hours drop.
  Dropped slots never replenish.
- Server-received Taken/Skipped, conflict, pause and the next same-medicine occurrence
  suppress pending sends. FE-545's course-end cutoff also applies to snoozes.
- Provider acceptance is neither guaranteed receipt nor intake. Submitted pushes
  cannot be retracted. Logging and recurrence remain independent of reminders.

### Approved decisions

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

### Acceptance timelines

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
