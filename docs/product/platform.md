> **Current hosting and persistence:** Next.js starts on **Vercel** ([FE-540](https://github.com/BraveHeart-tex/Meddies/issues/3)); a narrow Vercel Node → authenticated Worker → Drizzle → remote D1 path and atomicity were demonstrated in [FE-542](https://github.com/BraveHeart-tex/Meddies/issues/5). Direct D1 Worker bindings in Vercel Node are not assumed. Cloudflare-first app hosting is superseded. These spike results are not production-scale guarantees. Read this topic for architecture, not the full [FE-539](https://github.com/BraveHeart-tex/Meddies/issues/2) parent by default.

# 06 - Architecture, Storage & Integration

> **Status:** Approved architectural boundaries with narrow feasibility evidence ([FE-540](https://github.com/BraveHeart-tex/Meddies/issues/3)/[FE-541](https://github.com/BraveHeart-tex/Meddies/issues/4)/[FE-542](https://github.com/BraveHeart-tex/Meddies/issues/5)/[FE-544](https://github.com/BraveHeart-tex/Meddies/issues/7)), not a blanket production or real-iPhone notification guarantee. Current deployment progress is tracked in implementation tickets.

## Selected architecture and evidence status

| Concern               | Selected or preferred direction                                                                                  | Evidence / remaining work                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Client / app host     | **Next.js mobile-first PWA on Vercel**                                                                           | Vercel deployment demonstrated in [FE-540](https://github.com/BraveHeart-tex/Meddies/issues/3)                          |
| D1 access boundary    | **Authenticated Cloudflare Worker** called by Vercel Node                                                        | Remote path demonstrated in [FE-542](https://github.com/BraveHeart-tex/Meddies/issues/5); hardening separate            |
| Background scheduling | **Cloudflare Cron Triggers / Worker**, or approved authenticated [cron-job.org](http://cron-job.org) alternative | Reliability validation still required                                                                                   |
| Durable persistence   | **Cloudflare D1 with Drizzle ORM** via Worker                                                                    | Remote migration, atomic writes and claims demonstrated in [FE-542](https://github.com/BraveHeart-tex/Meddies/issues/5) |
| Push                  | **Firebase Cloud Messaging** preferred                                                                           | Real iPhone Home Screen PWA proof still blocked by [FE-543](https://github.com/BraveHeart-tex/Meddies/issues/6)         |
| Medication catalog    | Indexed D1 catalog tables separate from user records                                                             | Data licensing and coverage unresolved                                                                                  |
| Cache                 | **No Redis by default**                                                                                          | Add only on measured need                                                                                               |
| Database alternatives | **Neon/PostgreSQL** acceptable conditional fallback; Convex not selected                                         | No D1 blocker currently warrants fallback                                                                               |

The D1 decision prioritizes a cost-conscious, low-operations setup for a very small initial audience while preserving production engineering practices. **Neon inactivity behavior was a concern** and Convex was considered more BaaS than needed.

## Frontend streaming, Query and session contract - approved November 6, 2026

- Next.js authenticates before private content and starts independent initial reads concurrently. Stream coherent useful sections with stable, accessible Suspense fallbacks; await server prefetch within section boundaries and hydrate TanStack Query. Pending-query dehydration is optional later on measured benefit.
- Use request-scoped server query clients and one stable authenticated browser client. Server reads call authenticated feature operations; browser reads use authenticated API routes. Never serialize secrets or share private caches across users/requests.
- After hydration, TanStack Query owns interactive medicines, schedules and dated history. Related lists, counts and statuses use the same client cache; server-prefetched values must not become a second competing live view.
- Dose recording and correction update affected cached Today/History views optimistically, with an explicit saving/unconfirmed state. Apply authoritative server responses, then reconcile relevant queries without routine route refreshes.
- Roll back definite rejections without reverting unrelated/newer changes. A timeout or lost response is uncertain receipt, not proof of failure: preserve attempted details and action identity during the session, reconcile, and retry the same request safely. Conflicts require explicit recovery, never silent last-write-wins.
- Mutation tracking survives screen unmount/navigation; pending state and failure recovery remain visible at app level. New writes need connectivity. No durable offline mutation queue or automatic blind write replay.
- Retain usable cached content during stale-data refresh. Refresh stale queries on screen entry, focus and reconnect, plus targeted reconciliation after mutations. No routine polling initially. Advance due-time/day status locally; fetch newly required data without inventing unavailable coverage.
- Protect newer optimistic/confirmed changes from late server hydration, stale reads and out-of-order responses. Cache rollback/reconciliation is query- and revision-aware.
- Keep selected History date in the URL and restore navigation context. Keep unfinished medicine/schedule and dose drafts in session memory across app navigation; clear on successful submission or explicit discard. Explicit drawer Close/Cancel/backdrop/Escape/swipe behavior remains governed by FE-631; navigation does not cancel submitted work.
- Setup, schedule edits and snooze remain online and server-confirmed. Optimistic dose display does not establish server receipt, stock confirmation or reminder cancellation.
- Skeletons are for sections without usable data. Refresh and mutation retain content with local feedback. Keep stable geometry, reduced-motion support and useful loading announcements. Review affected UI at 402px under docs/verification.md. Add focused 320px, enlarged-text and reduced-motion checks when relevant. Preserve existing targeted regressions; no full capture matrix is required.
- In-memory cache/drafts/pending attempts need not survive reload, app closure or browser eviction. A brief stable cold-launch skeleton is acceptable. Clear private cache, drafts and mutations on sign-out/expiry and stop late responses repopulating them; connectivity loss alone is not sign-out.
- Persistent offline viewing, offline dose writes, real-time cross-device sync and background/closed-app synchronization are deferred. Installable PWA and closed-app push remain separate existing product scope.

FE-638 supplies shared foundations; FE-624 and FE-627 own route adoption/tests; FE-639 must pass before FE-625/FE-626 rollout. FE-628 integrates representative CI with FE-630. Approval is architectural scope, not runtime evidence.

## Data ownership boundaries

- **Catalog:** Infrequently changing Turkish medication identifiers and labels, with an ingest/update process.
- **User medications:** Personal medication instances and their configuration.
- **Schedules / dose occurrences:** What should happen and when.
- **Dose outcomes:** What the user explicitly confirmed, kept distinct from notification events.
- **Notification delivery:** Subscriptions, delivery attempts, retries and scheduling state.
- **Inventory:** Remaining count and refill thresholds.

These are conceptual modules, not a finalized table schema.

## Operational requirements

- Reliable reminders and idempotent dose confirmations.
- Cost discipline, particularly avoiding database plans with idle-instance friction.
- Explicit privacy/security review: this involves personal medication information.
- Device-realistic iOS/Android installation, permissions and push tests.
- Observability sufficient to distinguish scheduled delivery, provider acceptance, user receipt and explicit intake.
- FE-620 supersedes FE-548's offline MVP commitment. Require online writes, optimistic feedback and in-memory session recovery; persistent offline availability and queued writes are deferred. Installable PWA and closed-app push requirements remain unchanged.

## Feasibility evidence and remaining gates

| Evidence                                                     | Established boundary                                                                                                                          | Still not established                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [FE-540](https://github.com/BraveHeart-tex/Meddies/issues/3) | Isolated Next.js/Vercel deployment and measured sample request limits                                                                         | Sustained throughput, complete production readiness                                        |
| [FE-541](https://github.com/BraveHeart-tex/Meddies/issues/4) | Google allowlist/session lifecycle tested in a narrow deployment, with user-observed real-account checks                                      | Final production revocation/ownership policies                                             |
| [FE-542](https://github.com/BraveHeart-tex/Meddies/issues/5) | Vercel to authenticated Worker to D1/Drizzle, remote migration, atomic stock/intake rollback, idempotency and competing reminder-claim leases | Full production schema and capacity, provider delivery guarantees                          |
| [FE-544](https://github.com/BraveHeart-tex/Meddies/issues/7) | Synthetic encrypted D1 → private R2 → isolated D1 restore and independent key-recovery round trip                                             | Automated daily schedule, independent key custody, live restore and deleted-account safety |
| [FE-543](https://github.com/BraveHeart-tex/Meddies/issues/6) | **Not completed**                                                                                                                             | Installed/closed/locked real-iPhone FCM delivery, token lifecycle and deep links           |

Selected runtime: Vercel-hosted Next.js with a narrow authenticated Worker D1 boundary. Keep shared application behavior independent of invocation transport; avoid generic multi-provider frameworks without a measured need. Cloudflare Cron is the first scheduler candidate. Standard Web Push, Neon/PostgreSQL, and an authenticated external scheduler are conditional fallbacks, not parallel MVP deployments.

## Approved operations, privacy and recovery requirements

- Private single-user Google identity with an allowlist, server-side ownership checks and private deployment configuration; no hard-coded global user. Personal medication/catalog storage remain logically separate, and catalog replacements must never modify personal history.
- D1/Drizzle migrations and constraints; atomic intake+stock reconciliation and safe concurrent reminder claims. Stable action IDs/revisions and provider-attempt recording must handle duplicate/retry ambiguity. DB writes and external push submission are **not** a single atomic transaction.
- International hosting permitted. Minimize personal data; exclude medication details, OAuth secrets, notification endpoints and push credentials from routine logs and scheduler responses. No advertising analytics.
- Daily encrypted backups independently stored from D1, retained up to **30 days**; independently recoverable keys, tested decryption/restore, failed-backup monitoring and deletion-safe restore/replay protection. Time Travel is supplemental. Recovery targets are at most **24 hours of disaster data loss** and service restoration within **24 hours** (targets, not guarantees).
- Monitor stalled reminder processing independently of website uptime. Complete a one-week real-iPhone trial alongside the existing reminder method before relying on Meddies daily.
- Free-tier-first cost discipline; approximately **USD 5/month plus measured usage** is acceptable if justified. Do not add Redis, a separate queue, multiple databases, a Google scheduler or microservices without evidence of need.

## Verification boundaries

- **Behavioral:** Verify shared application operations for schedules, dose records, reminders, inventory and online retry/recovery with controlled time and observable state, not only internal function calls.
- **Integration:** Exercise real database migration/constraints, atomic intake+stock, concurrent claims, authentication/ownership, provider submission, and encrypted backup restoration.
- **User and device:** A focused set of browser accessibility, cached-navigation and online uncertainty/conflict journeys plus mandatory real-iPhone closed-app/locked-device notification and deep-link tests. Browser or simulator tests do not establish iPhone push delivery.
- **Failures:** Cover retries, partial acceptance, stock conflicts, stale reminder processing, backup failures, history/account deletion, and deleted-account suppression on restore. The current online/session contract and revised FE-549 export/deletion rules in topic 02 govern product expectations; FE-548 is deferred historical scope.

## Do not infer

Use the [FE-540](https://github.com/BraveHeart-tex/Meddies/issues/3)/[FE-541](https://github.com/BraveHeart-tex/Meddies/issues/4)/[FE-542](https://github.com/BraveHeart-tex/Meddies/issues/5)/[FE-544](https://github.com/BraveHeart-tex/Meddies/issues/7) evidence table for **narrowly proven** runtime properties. Do not extrapolate into unmeasured capacity, long-term quotas/pricing, production correctness, real-iPhone delivery, backup automation or deleted-account recovery safety. Record further evidence before expanding a preferred architecture into a production-readiness claim.

## Related reading

- 03 - Medication & Dose Domain
- 04 - Notifications & Reminder Delivery
- 05 - Turkish Medication Catalog & Barcode
- 07 - Delivery Slices, Feasibility & Decisions
- Documentation index: [Meddies 00 - Agent Guide & Documentation Index](./README.md)

---

[Back to Meddies - Agent Guide & Documentation Index](./README.md)

## Historical offline availability clarification - FE-548 (deferred beyond MVP)

> **Current MVP scope - approved November 6, 2026:** [FE-620](https://github.com/BraveHeart-tex/Meddies/issues/82) supersedes the earlier offline MVP commitment. Writes require connectivity; optimistic dose changes remain visibly unconfirmed until acknowledged. Previously loaded data, drafts and uncertain-save recovery live in memory during the open session. Persistent offline availability, queued offline writes and pending-work recovery after reload/app closure are deferred beyond MVP. Server retry, revision, ownership and stock correctness remain required. Implementation is separate from this planning approval.

Bora approved D1-D6 and all 19 examples on November 3, 2026: 30 preceding calendar days of cached history plus elapsed today; seven dose dates today through day 6 in Europe/Istanbul; offline unscheduled intake for cached medicines; truthful unavailable/initial-setup states; and preservation of pending/conflict work beyond display retention. Setup, schedule edits and snooze remain online and server-confirmed. No local reminder engine or guaranteed closed-app sync. See [02 - UX & User Journeys](./ux-journeys.md), section "FE-548 - Approved offline availability boundaries (November 3, 2026)", and [FE-548](https://github.com/BraveHeart-tex/Meddies/issues/11). These rules resolved the original FE-539 gaps historically; FE-620 now defers them beyond MVP. They do not authorize persistent caching or offline write implementation.

## Approved export and deletion clarification - FE-549

Bora approved D1-D6 and all 16 examples on November 3, 2026: all retained server history exported as CSV files in a ZIP; deliberate history deletion by medicine/date with preview; stock-preserving deletion; active account deletion; and honest offline-device, encrypted-backup and restore boundaries. See [02 - UX & User Journeys](./ux-journeys.md), section "FE-549 - Approved export and deletion scope (November 3, 2026)", and [FE-549](https://github.com/BraveHeart-tex/Meddies/issues/12). Detailed rules and examples are authoritative there, including the November 6 session-action revisions to D2/D3/D6. Durable offline queues are no longer an MVP dependency of export/deletion. Export/deletion and backup/restore implementation remain separate; the 30-day backup policy is unchanged.

## Accessibility and visual verification - approved November 7, 2026

Review affected UI at 402px under docs/verification.md. Add focused 320px, enlarged-text and reduced-motion checks when relevant. Preserve existing targeted regressions; no full capture matrix is required. Meddies does not claim formal WCAG conformance. Preserve accessible labels, semantic controls, contrast, visible focus, 44px targets, safe areas, actual text enlargement, reduced-motion support, non-color status cues and reachable actions. The conditional text-enlargement stress target is 200%, with actual method/setting recorded; a CSS font-size probe is supplementary synthetic evidence. 201×437 viewport captures are not zoom or text-enlargement evidence.

FE-688 owns reusable captures. Route owners retain behavioral/request-count/layout-budget assertions; the wave gate owns consolidated loading review and links existing route evidence without recapture. FE-616 retains physical iPhone acceptance, FE-602 integrated accessibility, and FE-642 the explicit approximately 39.7px calendar-target exception at 320px (38.6px before its popover change). Required local verification and CI remain unchanged. Earlier blanket capture requirements in historical designs/discussions are superseded. Full policy and progress: [FE-620](https://github.com/BraveHeart-tex/Meddies/issues/82); durable commands: repo docs/verification.md#visual-verification.
