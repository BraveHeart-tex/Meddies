# Meddies

A personal medication reminder and tracker. These terms describe how saves, drafts and the
signed-in session behave from the user's side.

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
