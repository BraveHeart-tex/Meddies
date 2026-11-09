# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the initial user, a private individual who manages her own medication routine. She uses Meddies mostly on her iPhone 17 (402×874 CSS px, 3x DPR) as an installed PWA, in short moments through the day: checking what is next, recording a dose late, noticing low stock. Meddies is single-user for the foreseeable future. Caregivers, sharing and multiple accounts are out of scope.

## Product Purpose

Meddies helps her remember medication, record what she actually took, notice low stock and remember to eat before selected doses. Mission: "Never miss a dose. Never run out. Feel in control." This is the mission, not a delivery or clinical guarantee. Success means daily use she can trust: the app's record matches reality, and it never claims more than it knows.

## Positioning

A reminder is never confused with confirmed intake. Every dose outcome is explicit (Taken or Skipped, saved only when she saves it), actual intake time is kept separate from scheduled time, and an unconfirmed past dose is labeled "Not logged", never "Missed". Late logging, connectivity loss and schedule changes never silently rewrite her routine or history.

## Operating Context

- Private Google sign-in limited to one allowlisted account. English interface. Schedules and times are in Türkiye time (Europe/Istanbul) and shown in 24-hour format, whatever the device timezone.
- Main areas: Today (the next action and unresolved doses), Medications (manual setup and schedules), History (past outcomes and corrections), Settings.
- Closed-app push reminders with bounded follow-ups, snooze, optional quiet hours and generic lock-screen content by default.
- Writes require connectivity. Dose recording and correction provide optimistic feedback with an explicit unconfirmed state until server acknowledgement. Previously loaded views and drafts remain in memory across app navigation; unconfirmed saves retain recovery details during the session. Persistent offline viewing, queued offline writes and recovery after reload or app closure are deferred beyond MVP.

## Capabilities and Constraints

- Manual medicine entry with a label, quantity unit, and product strength kept distinct from the quantity taken. Whole or half tablets and whole capsules.
- Schedules: daily at set times, selected weekdays, every X hours from a chosen start, or no schedule for occasional use. Optional end date. Pause and resume without a backlog. Edits affect future doses only.
- Record Taken or Skipped, correct outcome, time or quantity, and log unscheduled intake without moving reminders.
- Optional stock tracking: Taken subtracts, Skipped does not, refills and count corrections, per-medicine low-stock threshold, never negative.
- Optional per-medicine food reminder with a lead time. It never changes dose timing.
- Setup, schedule changes and snooze save only after server confirmation. Online stale revisions and conflicting outcomes require explicit recovery, never silent overwrites. Expanded offline or multi-device synchronization UX is deferred.
- History export, deliberate history deletion and account deletion.
- Stack: Next.js App Router on Vercel, Cloudflare Worker with D1, Auth.js. Approved frontend architecture: streamed server-prefetched sections hydrate TanStack Query, which owns interactive data during the session. Stale data refreshes on entry, focus and reconnect, with targeted mutation reconciliation and no routine polling. Adoption and verification are tracked in [FE-620](https://linear.app/karacadev/issue/FE-620/adopt-streaming-ssr-with-tanstack-query-and-fast-client-interactions); implementation remains separate. See the docs index in AGENTS.md.
- Detailed requirements: [FE-539](https://linear.app/karacadev/issue/FE-539/meddies-private-mvp-product-and-engineering-specification). Interaction contract: [FE-612](https://linear.app/karacadev/issue/FE-612/record-the-approved-mobile-ux-contract).

## Brand Commitments

- Name: Meddies. The logo is Two capsules, used for app icons and favicons. In app screens, write the name as a wordmark.
- Personality: cozy, cheerful, dependable. [docs/copy.md](docs/copy.md) holds the voice and the wording rules.
- No guilt, pressure or motivational mechanics such as streaks.
- No medical advice. Meddies never infers intake automatically.

## Evidence on Hand

- Approved visual direction "Cozy Care": `.agents/skills/meddies-design/` and [DESIGN.md](DESIGN.md).
- Production screens are in `src/app`. They use synthetic data only.
- There are no testimonials, metrics, press or marketing content, and none should be invented.

## Product Principles

1. Truth over reassurance: never show intake, sync or reminders as further along than they are.
2. Explicit over inferred: she decides every outcome, and nothing is recorded until she saves.
3. The plan stays put: late logging, pauses and edits never silently shift the schedule or past records.
4. Calm, bounded nudges: reminders persist but always have a limit, and they respect quiet hours and privacy.
5. Fast in the moment: the next action on Today is obvious and takes one or two taps.

## Accessibility & Inclusion

Meddies is designed for its sole user on an iPhone 17 as an installed PWA, with 402px as the primary layout width. Meddies does not claim formal WCAG conformance. Preserve semantic controls and accessible labels, readable text and accessible contrast, visible keyboard focus, 44px minimum touch targets, safe-area spacing, text enlargement, reduced-motion support, and actions reachable by scrolling and with the keyboard open. Show status with text and an icon, never color alone. Verification follows [docs/verification.md](docs/verification.md#visual-verification); conditional checks do not make these safeguards optional.
