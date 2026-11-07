# Client state

What the browser keeps between screens: pending saves, unconfirmed saves, session drafts
and the Query cache, and how session end clears them. Terms follow
[GLOSSARY.md](../GLOSSARY.md); screen states and copy follow
[DESIGN.md](../DESIGN.md#loading-and-saving).

All private client state lives in memory, in one browser Query client per authenticated
session (`src/lib/session-query-client.ts`, [Next.js](nextjs.md#query-ownership)). No
browser storage is used. Losing it on reload, app closure or browser eviction is accepted;
offline viewing, queued offline writes, cross-device sync and background sync are out of
scope.

## Saves

- **One action ID per attempt.** The browser generates an action UUID per user attempt and
  reuses it, with the identical payload, on every retry, so Worker idempotency returns the
  original outcome instead of writing twice. Edited values start a new attempt with a new
  ID. Corrections also send the expected revision. Attempts are never replayed after
  reload.
- **Lifetime.** Save tracking lives above routes. Pending saves and their failures survive
  unmount and navigation, stay visible app-wide, and are never cancelled by navigation.
  The session feedback host reports confirmation or recovery through the app Toast host.
- **Dose saves** live in the session dose save store (`dose-saves.ts`). A pending save
  survives the drawer and Today, its row badge reads the store, and a result with no
  drawer watching arrives as a Toast.
- **Optimistic doses.** The pending badge on Today and History rows is the only optimistic
  state; nothing is written to the cache before the server confirms. A confirmed record,
  from either view, is written into Today's snapshot when the dose is due today and into
  the dose's cached History date, then those exact query keys reconcile. Merges never move
  a revision back, so stale reads and late hydration cannot undo it.
- **Server-confirmed only.** Medicine setup, schedule edits and snooze show no optimistic
  state, and new writes need connectivity.
- **Definite rejection** clears only that save's pending state and writes no cache, never
  touching a newer unrelated save.
- **Unconfirmed save.** A timeout or lost response keeps the attempted details and action
  ID, reconciles, and offers a retry of the same request. Unconfirmed dose saves stay on
  their rows, are rechecked on focus and reconnect by reading Today (dose due today) or
  the dose's History date, and confirm once any Today or History date read shows a
  matching record.
- **Conflict** needs explicit user recovery; the server's current outcome is shown, never
  silently overwritten.

## Session drafts

Medicine Add, schedule setup and the dose drawer keep raw editing values in an in-memory
store scoped to the session Query client, keyed by form and medicine ID.

- Returning restores values through React Hook Form `reset`, with "Unsaved details from
  earlier." and a ghost "Clear form". The dose drawer reopens itself with its chosen
  outcome and Taken values; explicit dismissal is its Clear form.
- A confirmed save or Clear form discards the draft; Clear form also resets defaults.
  Navigation, refresh and clock rollover keep it.
- `/medications` query states (`?add`, `?medicine`, `?schedule`) share one mounted
  `MedicinePanel`, so reset per-screen state when the screen changes.
- The selected History date lives in the URL.

## Session end

Sign-out and expiry clear the session Query client, session drafts, and pending and
unconfirmed saves, and stop in-flight responses from repopulating them. The app hides
authenticated content at expiry and checks the session when focus returns. Losing the
network is not session end; server operations always check independently
([authentication](authentication.md#sessions-and-revocation)).
