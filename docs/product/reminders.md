# 04 - Notifications & Reminder Delivery

## User promise

Never forget a dose. Reminders should be **proactive, configurable, persistent enough to be useful and trustworthy**, including when the PWA is closed wherever the platform allows.

Reminder configuration and confirmed dose history are separate. A notification being sent or clicked does **not** mean the dose was taken.

## Current preferred technical direction

- Backend-scheduled delivery through a Cloudflare Worker Cron Trigger (#30).
- **Firebase Cloud Messaging (FCM)** is the push provider. #6 proved closed and locked delivery to the Home Screen app on a real iPhone, so standard Web Push is not used.
- Email reminder fallback is outside the approved private MVP; it requires a separate scope decision.

FCM delivery is best effort. Neither #6 nor provider acceptance guarantees that a reminder arrives.

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
- An online, server-confirmed 40-minute **snooze** reserves an available follow-up slot, never adds a third one. Only an explicitly confirmed snooze may extend normal +80 expiry; the exact slot, coalescing and five-minute submission rules are governed by #9 below.

### Suppression, quiet hours and expiry

- Optional quiet hours run 23:00 inclusive to 08:00 exclusive, Europe/Istanbul. Original dose reminders still target their chosen times; follow-ups and snoozes targeted inside quiet hours are **dropped**, not queued for morning. Dropped slots do not replenish.
- Stop future unsent dose reminders after the server receives Taken/Skipped. Pause and a newer same-medicine occurrence also suppress the older pending sends; the old occurrence remains in history. Reminders may continue while a save is unconfirmed.
- At 00:00 Europe/Istanbul after a course's inclusive final day, no further occurrence or unsent dose-related reminder (including snoozes) may be sent. Preserve already-due history; see #8 in [03 - Medication & Dose Domain](./medication-domain.md).
- Submitted notifications cannot be recalled. Provider acceptance is not confirmed user receipt, and neither delivery nor tapping confirms medication ingestion.

### Refill reminders and privacy

- Refill pushes follow the #10 per-medicine low-stock episode budget in topic 03. They are **not stopped by dose pause**; quiet-hour deferral rechecks the current eligible episode at 08:00 or later rather than sending stale work.
- Use generic lock-screen notification text by default; displaying medicine names (including refill alerts) requires explicit user opt-in.
- A refill push opens the Medications list. Use the [refill push wording](../copy.md#refill-push-wording) with either Medication names setting.
- Recheck expiration, cancellation, preferences and eligibility before submission. Record intended sends and delivery attempts separately. Do not claim exactly-once push receipt, silent iOS background execution or Focus bypass.

## Remaining delivery and integration decisions

**Still unverified:** operational monitoring (#61).

The precise copy and device-settings UX remain design work within these rules.

## #9 - Approved snooze and delayed-reminder boundaries (November 3, 2026)

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

| Case                    | Timeline                                                                                            | Expected result                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Baseline                | Dose 09:00, timely checks                                                                           | Original 09:00; automatic slots 09:40 and 10:20.                                                              |
| Intermediate snooze     | Dose 09:00; confirm snooze 09:20                                                                    | Slot 1 targets 10:00. Slot 2 would move to 10:40, beyond ordinary expiry, so retires. No 09:40 or 10:20 send. |
| Immediate snooze        | Dose 09:00; confirm snooze 09:00                                                                    | Slot 1 targets 09:40; slot 2 stays 10:20.                                                                     |
| Final-slot extension    | Dose 09:00; slot 1 submitted 09:40; snooze 10:10                                                    | Slot 2 targets 10:50; original 10:20 target replaced.                                                         |
| Exact expiry request    | Dose 09:00; slot 1 submitted; slot 2 unused; snooze confirmed 10:20 before submission wins the slot | Target 11:00 accepted. If slot 2 submission wins first, reject snooze as exhausted.                           |
| After ordinary expiry   | Same dose; request at 10:20:01                                                                      | Reject new snooze even if scheduler has not processed slot 2. Existing confirmed extension can still run.     |
| Exhausted budget        | Both slots submitted or dropped; request 10:00                                                      | Reject; no third slot.                                                                                        |
| Pending snooze          | Snooze confirmed 09:20 for 10:00; distinct request 09:30                                            | Reject second pending snooze; retry of original returns 10:00.                                                |
| Delayed recovery        | No submissions for 09:00 dose; first check 10:05                                                    | Submit only 09:40 slot; retire original. Keep future 10:20 slot.                                              |
| Exact automatic cutoff  | No submissions; first check 10:20                                                                   | Submit only 10:20 slot; retire original and 09:40 slot.                                                       |
| Past automatic cutoff   | No submissions; first check 10:20:01                                                                | Drop all automatic jobs; no catch-up. The strict cutoff may lose the final slot to check jitter.              |
| Snooze lateness         | Confirm 10:10, target 10:50; process 10:55 or 10:55:01                                              | Submit at 10:55; drop at 10:55:01. No slot replenishment.                                                     |
| Pending snooze recovery | Confirm 09:20 for 10:00; check 09:50 then 10:04                                                     | No automatic 09:40 send; one snooze send 10:04.                                                               |
| Quiet target            | Dose 22:00; slot 1 unused; snooze confirmed 22:30                                                   | Slot 1 target 23:10 drops and consumes slot; no morning deferral. Slot 2 also retires.                        |
| Quiet crossing          | Snooze targets 22:59; process 23:01                                                                 | Drop despite being inside the five-minute tolerance. Target 08:00 is outside quiet hours; 23:00 is inside.    |
| Quiet slot unavailable  | Dose 22:00; slot 1 submitted; request 22:50; automatic slot 2 targets 23:20                         | Slot 2 is already disqualified by quiet hours; reject snooze.                                                 |
| Next dose equality      | Old snooze targets 10:50; next same-medicine dose due 10:50                                         | Suppress old snooze at equality; new occurrence is independent.                                               |
| Outcome / pause         | Snooze targets 10:50; relevant suppression reaches server 10:49                                     | Cancel pending snooze. Already submitted pushes may still arrive.                                             |
| Course end              | End Nov 3; snooze targets Nov 4 00:00                                                               | Cancel at course-end boundary, even with quiet hours disabled.                                                |

## #29 - Approved device registration rules (November 16, 2026)

- A **Device registration** lets backend reminders reach one installed Meddies app on one device.
  An account can have several; each belongs to exactly one account. Registering an installation
  that another account registered moves it to the signing-in account only when it presents
  the same FCM registration token. A different token leaves that row unchanged and answers
  `registered: false`. The owning account can replace its token.
- Registrations hold an FCM registration token. #6 proved FCM on a real iPhone, so Meddies
  never runs a second provider.
- Turning notifications on asks for system permission only from an explicit tap in Settings, and
  only where the device can receive pushes; on iPhone that means the Home Screen app. Settings
  shows notifications as on only after the server confirms the registration.
- Settings states which case applies to this device: it can't receive notifications, it needs the
  Home Screen app (with install steps), notifications are off, they are blocked in system
  settings, or they are on. Blocked explains how to allow them again; Meddies cannot ask twice.
- Turning notifications off in Meddies removes this device's registration. System permission
  stays granted, so turning them on again needs no new prompt.
- A signed-in launch renews an existing registration with the current token. It never recreates
  a removed one. A launch that finds permission revoked removes the registration. The sender
  (#30) removes tokens the provider rejects.
- Deliberate sign-out removes this device's registration and always completes, even if that
  removal fails. Session expiry keeps the registration, so reminders do not stop when the
  seven-day session ends. After signing in again, notifications are off until turned on.
- Registration tokens are credentials: never shown in reads, logs, error responses or export.

## #30 - Approved dose reminder rules (November 17, 2026)

- A Cloudflare Cron Trigger runs the due-reminder operation on the Worker every minute. An
  authenticated Worker command runs the same operation for the approved external scheduler.
- An **Original reminder** is eligible from its occurrence's due instant until a later reminder of
  that occurrence is due ([#9 D4](#approved-decisions)), and never after due +80 minutes; later
  processing drops it without sending. An occurrence with Taken or Skipped recorded at processing
  time gets none.
- Each run claims an Original reminder once, even when runs overlap, and records one **Delivery
  attempt** per Device registration of its owner. A transient provider failure leaves it eligible
  for the next run inside its window. A provider answer of `UNREGISTERED` or `NOT_FOUND` removes
  that registration.
- Original reminders due at the same instant for one owner go out as one reminder per Device
  registration, covering those without Taken or Skipped at processing time (#372). One recorded
  after its instant's reminder was submitted goes out on its own.
- The reminder uses the generic wording in [copy](../copy.md#reminder-wording), never a medication
  name before the #37 opt-in. A reminder covering one occurrence carries its **Reminder link**; one
  covering several carries a Reminder link to their due instant.
- Tapping a one-dose reminder opens that dose's drawer: on Today when Today lists the occurrence,
  otherwise on History for its History date. A link to an occurrence that no longer exists or
  belongs to another account opens Today with no drawer.
- Tapping a several-dose reminder opens the screen that lists them, with no drawer: Today when
  their due day is today, otherwise History for that day.
- A signed-out tap opens its destination after sign-in.

## #31 - Approved follow-up reminder rules (November 17, 2026)

- Each occurrence has two **Follow-up reminders**, targeted at due +40 and +80 minutes. Retries,
  transient answers and dropped or retired reminders never add one.
- Per occurrence, a run submits only the reminder with the latest target at or before processing
  time and retires the older ones, the Original reminder included ([#9 D4](#approved-decisions)).
  No automatic reminder submits after due +80 minutes; at equality the second Follow-up reminder
  may still submit.
- Follow-up reminders recheck Taken or Skipped at processing time, are claimed once, retry and
  record Delivery attempts as Original reminders do ([#30 rules](#30---approved-dose-reminder-rules-november-17-2026)).
- Follow-up reminders of occurrences sharing a due instant go out as one reminder per Device
  registration with the grouped Reminder link. A Follow-up reminder never shares a push with
  another due instant's reminders, so two pushes can arrive in the same minute.
- The wording names the due time, never the medication ([copy](../copy.md#reminder-wording)).

## #34 - Approved next-occurrence rules (November 17, 2026)

- Once a newer Occurrence of the same Medicine is due, every unsent Original and Follow-up
  reminder of its older Occurrences drops unsent, at equality too. The newer Occurrence can
  come from any Schedule version of that Medicine and counts even with an early Taken or Skipped.
- The older Occurrence keeps Taken, Skipped or Not logged; dropping its reminders records nothing.
- Unscheduled doses and other Medicines' Occurrences never drop a reminder.
- A transient answer, an abandoned claim or a late run never submits a dropped reminder.
- Snoozes follow the same rule (#36).

## #35 - Approved quiet hours rules (November 17, 2026)

- Quiet hours are one account-wide preference, off by default. Turning them on or off applies to
  every Device registration of the account.
- The window is fixed at 23:00 inclusive to 08:00 exclusive, Europe/Istanbul; nothing else is
  configurable.
- With quiet hours on, a Follow-up reminder drops unsent when its target or its processing time is
  inside the window ([#9 D5](#approved-decisions)). Its slot is never replaced and nothing catches
  up at 08:00. Original reminders still submit at their due instant.
- The check is a send-time recheck of the current preference, so a change applies to reminders
  already recorded but unsent; setting it writes no reminder rows.
- Snoozes (#36) and refill pushes (#54) apply the same window by their own rules above.

## #37 - Approved medication names rules (November 17, 2026)

- Medication names in reminders is one account-wide preference, off by default. Turning it on or
  off applies to every Device registration of the account.
- Off, a reminder uses the generic wording in [copy](../copy.md#reminder-wording) and its
  submission carries no Medicine label: not in its title, body, Reminder link or other data.
- On, a dose reminder names each Medicine it covers by its label alone, never its strength, dose
  amount or Type. One covering several Medicines lists each once, in label order.
- A label appears only in the title and body. Delivery attempts, error responses and logs never
  hold one.
- The check is a send-time recheck of the current preference and labels, so a change or a renamed
  Medicine applies to reminders already recorded but unsent; setting it writes no reminder rows.
- Snoozes (#36) use the named Follow-up reminder wording. Refill pushes (#54) use the same
  preference and follow the [refill push wording](../copy.md#refill-push-wording).

## #36 - Approved snooze rules (November 17, 2026)

- A **Snooze** is requested from the dose drawer of an Occurrence without a Dose outcome,
  from its due instant through due +80 minutes inclusive (Due now and Not logged).
  Reminders carry no snooze action.
- The server accepts it under [#9](#approved-decisions) and targets it 40 minutes after
  accepting, in whole seconds. It is rejected while the account has no Device registration.
- Snooze is server-confirmed only ([saves](../client-state.md#saves)): nothing shows it as
  applied before the server accepts it, and offline it is unavailable.
- Today and History dose reads carry a pending snooze's target, so every device shows it until
  it is submitted or dropped.
- A Snooze accepted already dropped because its target is inside Quiet hours also carries
  that no-reminder result and target in Today and History reads, so reopening shows
  "No reminder" instead of Snooze. A later scheduler drop is not this result.
- A snooze reminder covers only its Occurrence, with its Reminder link, never grouped with other
  doses, and uses the Follow-up reminder wording ([copy](../copy.md#reminder-wording)).
