# Meddies

A personal medication reminder and tracker. These terms describe how loading, saves, drafts
and the signed-in session behave from the user's side.

## Medicines

**Medicine**:
Something the user takes and tracks in Meddies, with a label, quantity unit and strength.
_Avoid_: medicine, in UI copy; write medication there

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

**Edit time**:
The moment the server confirms a schedule edit. Doses due at or before it, and any dose already
recorded, stay with the earlier Schedule version; only later doses follow the new one.
_Avoid_: cutoff, effective instant, in UI copy and tickets

## Doses

**History date**:
The day a dose was due, in Istanbul time. A dose shows on its History date even when it was
taken on another day.
_Avoid_: taken date, record date

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
