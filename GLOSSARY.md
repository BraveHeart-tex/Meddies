# Meddies

A personal medication reminder and tracker. These terms name medicines, schedules, doses, reminders,
saves, drafts, the signed-in session and loading from the user's side.

## Medicines

**Medicine**:
Something the user takes and tracks in Meddies, with a label, quantity unit and strength.
_Avoid_: medicine, in UI copy; write medication there

**Medicine type**:
The form of a Medicine, such as Tablet, Capsule, Liquid, Inhaler or Drops.
_Avoid_: unit, when naming the Medicine type; write Type in UI copy

**Quantity unit**:
What a Medicine's dose amount counts or measures, such as tablets, capsules, ml, puffs or drops.
It is separate from the Medicine's strength and the container it comes in.
_Avoid_: type, when naming the Quantity unit; strength unit

**Detail correction**:
An edit that fixes a Medicine's wrongly entered details, such as a mistyped strength. Every dose
shows the fixed details; the server keeps the earlier values.
_Avoid_: rename, update, when the kind of edit matters

**Strength change**:
An edit recording that the user takes a different strength of the same Medicine from a named
moment. It adds a strength revision; doses already recorded keep the strength they saved.
_Avoid_: correction, new pack, new medicine

**Archived medicine**:
A Medicine the user no longer takes, kept out of the Medications list, with its schedule stopped
and reminders cancelled. Its doses and outcomes stay in History and export.
_Avoid_: deleted, removed, inactive medicine

## Schedules

**Clock schedule**:
A schedule whose doses fall at set times of day, every day or on selected weekdays.
_Avoid_: fixed schedule, daily schedule, when weekdays may also apply

**Interval schedule**:
A schedule whose doses repeat every chosen number of elapsed hours, across midnight, counted from
its Anchor.
_Avoid_: hourly schedule, recurring schedule

**Anchor**:
The date and time an Interval schedule counts from. A dose is expected at the Anchor only if the
Anchor is later than when the schedule was saved. Recording a dose late never moves it.
_Avoid_: first dose, in code and tickets; start time

**Schedule version**:
A medicine's schedule as saved at one point in time. An edit saves a new Schedule version; the
earlier one keeps its doses and their outcomes.
_Avoid_: schedule revision, old schedule

**Last day**:
The optional final day of a schedule, in Istanbul time. Doses on that day are still expected;
none after it. Earlier doses and their outcomes stay.
_Avoid_: end date, in UI copy and tickets; course end

**Ended schedule**:
A schedule whose Last day has passed, or that was stopped. It expects no more doses; its earlier
doses and their outcomes stay.
_Avoid_: finished, completed, inactive schedule

**Stop a schedule**:
End a schedule at its Edit time instead of at a Last day. Doses due by then stay; none after.
The schedule becomes an Ended schedule.
_Avoid_: remove, delete, cancel a schedule

**Pause a schedule**:
Put a schedule on hold at its Edit time. Doses due by then stay; none are expected while it is
paused, and none are made up later. A paused schedule is not an Ended schedule; if its Last day
passes while paused, it becomes one.
_Avoid_: suspend, hold, disable a schedule

**Resume a schedule**:
Take a paused schedule off hold at its Edit time, keeping its routine and Last day. A Clock
schedule continues at its next set time; an Interval schedule continues from a new Anchor.
_Avoid_: restart, unpause, in UI copy and tickets

**Edit time**:
The moment the server confirms a schedule edit. Doses due at or before it, and any dose already
recorded, stay with the earlier Schedule version; only later doses follow the new one.
_Avoid_: cutoff, effective instant, in UI copy and tickets

## Doses

**Occurrence**:
One dose a Schedule version expects, identified by its schedule and due instant, so it stays the
same across reloads and devices.
_Avoid_: slot, instance; write dose in UI copy

**Dose outcome**:
What the user recorded for an Occurrence: Taken or Skipped. Nothing records one except the user
saving it.
_Avoid_: status, log entry; in UI copy, write what happened, or name Taken or Skipped

**Taken**:
A Dose outcome that keeps the actual intake time and quantity, separate from the scheduled time.
_Avoid_: done, completed, confirmed

**Skipped**:
A Dose outcome recording a deliberate skip at its confirmation time, with no intake time or
quantity.
_Avoid_: missed, dismissed

**Due now**:
An Occurrence with no Dose outcome, from its due time until 15 minutes after it. It is a status on
screen only: reminders keep their own timing.
_Avoid_: active, current, pending dose

**Not logged**:
An Occurrence with no Dose outcome once its Due now window has passed. It proves neither intake
nor a skip and can still be logged.
_Avoid_: missed, overdue

**Unscheduled dose**:
A dose the user records as taken with no Occurrence behind it, keeping its intake time and
quantity. It is always Taken, never Skipped or Not logged, and never stands in for an Occurrence
or moves later doses.
_Avoid_: extra dose, PRN dose, unscheduled intake in new text; write dose in UI copy

**History date**:
The day a dose was due, in Istanbul time; for an Unscheduled dose, the day it was taken. A
scheduled dose shows on its History date even when it was taken on another day.
_Avoid_: taken date, record date

## Reminders

**Device registration**:
The server's record that lets backend reminders reach one installed Meddies app on one device,
for one account. Saving it is what makes notifications on for that device; system permission
alone does not.
_Avoid_: subscription, push token, in UI copy and tickets

**Original reminder**:
The first reminder for an Occurrence, targeted at its due instant. Follow-up reminders and
snoozes are separate.
_Avoid_: dose notification, first push

**Follow-up reminder**:
An automatic reminder for an Occurrence still without Taken or Skipped, targeted 40 or 80 minutes
after its due instant. Each Occurrence has two; a snooze reserves one rather than adding a third.
_Avoid_: nudge, repeat push, retry

**Snooze**:
A server-confirmed request, from the dose drawer, to be reminded of one Occurrence 40 minutes
later. It reserves one of the Occurrence's two Follow-up reminders rather than adding a third.
_Avoid_: remind me later, delay

**Quiet hours**:
An optional account-wide window, 23:00 to 08:00 Europe/Istanbul and off by default, in which
Follow-up reminders, snoozes and food reminders are dropped and refill pushes wait until 08:00.
Original reminders still go out.
_Avoid_: do not disturb, mute, night mode

**Delivery attempt**:
One submission of a reminder to one Device registration, with the provider's answer. Provider
acceptance is not delivery, and never intake.
_Avoid_: send result, push result

**Reminder link**:
The link a reminder carries to its Occurrence. Opening it shows that dose's drawer once. A
reminder covering several Occurrences links to their due instant and opens the screen listing
them.
_Avoid_: deep link, notification URL

## Saves and drafts

**Pending save**:
A submitted save the server has not answered yet. It stays visible while the user moves around
the app.
_Avoid_: in-flight write, queued write

**Unconfirmed save**:
A save attempt whose server receipt is unknown, kept with its original details until it is
reconciled or retried as the same attempt.
_Avoid_: uncertain save, uncertain receipt, failed save

**Session draft**:
Unsubmitted form values kept in memory for the current session, cleared by a confirmed save or an
explicit discard.
_Avoid_: saved draft, offline draft, autosave

## Session

**Session end**:
Sign-out or expiry of the signed-in session, which removes all private data, session drafts and
pending or unconfirmed saves from the browser. Losing the network is not session end.
_Avoid_: logout, signed-out state

## Loading

**Cold launch**:
Opening Meddies in a tab with nothing loaded yet. The user sees placeholders in the final layout
until the first content arrives.
_Avoid_: splash screen, boot
