# Client state

What the browser keeps between screens: pending saves, unconfirmed saves, session drafts
and the Query cache, and how session end clears them. What the user sees is the
[session contract](product/ux-journeys.md#session-contract) in topic 02; this doc is how the
browser implements it. Screen states follow [DESIGN.md](../DESIGN.md#loading-and-saving).

All private client state lives in memory, in one browser Query client per authenticated
session (`src/lib/session-query-client.ts`, [Next.js](nextjs.md#query-ownership)). No
browser storage is used. Losing it on reload, app closure or browser eviction is accepted.

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
store scoped to the session Query client, keyed by form and medicine ID. A schedule change
is keyed by the Schedule version it edits, so a newer version opens without an older draft.

- Returning restores values through React Hook Form `reset`, with the
  `saveMessages.draftRestored` notice and a ghost "Clear form". The dose drawer reopens
  itself with its chosen outcome and Taken values; explicit dismissal is its Clear form.
  Add's Drawer works the same way: swipe, Close, backdrop and Escape are its Clear form and
  also drop a failed save.
- A confirmed save or Clear form discards the draft; Clear form also resets defaults.
  Navigation, refresh and clock rollover keep it.
- `/medications` query states (`?add`, `?medicine`, `?schedule`, `?resume`) share one mounted
  `MedicinePanel`, so reset per-screen state when the screen changes. Changes between them
  use the native History API (`medications-nav.tsx`), so they read the Query cache without a
  server round trip; `features/medicines/routes.ts` owns view parsing and hrefs.
- The selected History date lives in the URL.

## Session end

Every session end goes through `endSession` (`src/features/auth/session-end.ts`). It clears
the session Query client, session drafts, pending and unconfirmed saves and private Toasts,
replaces authenticated content with sign-in, and passes the validated current location as
`returnTo`. In-flight responses, retained client references and mounted forms cannot restore
any of it, and a new session starts empty.

- **What establishes it.** The absolute deadline, with no request. Otherwise only a 401 from
  a no-store `/api/session` check, run when focus returns and after a 401 from a private read
  or save. Sign-out keeps its own confirmation so it can report a still-active or unknown
  result. Losing the network, an unavailable check or an active session is not session end;
  server operations always check independently
  ([authentication](authentication.md#sessions-and-revocation)).
- **A save's 401** stays pending through the check, then continues as an unconfirmed save if
  the session is not over.
- **Pending and unconfirmed saves.** Before clearing, only whether one existed survives, as
  a generic sign-in notice with no medication details. Sign-out with one outstanding warns by
  name first and offers to stay signed in.
