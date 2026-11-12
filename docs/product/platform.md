# 06 - Architecture, Storage & Integration

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
- Skeletons are for sections without usable data. Refresh and mutation retain content with local feedback. Keep stable geometry, reduced-motion support and useful loading announcements. Visual checks follow [verification](../verification.md#visual-verification).
- In-memory cache/drafts/pending attempts need not survive reload, app closure or browser eviction. A brief stable cold-launch skeleton is acceptable. Clear private cache, drafts and mutations on sign-out/expiry and stop late responses repopulating them; connectivity loss alone is not sign-out.
- Persistent offline viewing, offline dose writes, real-time cross-device sync and background/closed-app synchronization are deferred. Installable PWA and closed-app push remain separate existing product scope.

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
- Require online writes, optimistic dose feedback and in-memory session recovery. Persistent offline availability and queued writes are [deferred](./deferred.md). Installable PWA and closed-app push stay in scope.

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
- **Failures:** Cover retries, partial acceptance, stock conflicts, stale reminder processing, backup failures, history/account deletion, and deleted-account suppression on restore. Topic 02 governs session and export/deletion expectations.

## Evidence limits

The evidence table proves only narrow runtime properties. Capacity, long-term quotas and pricing, production correctness, real-iPhone delivery, backup automation and deleted-account recovery each need recorded evidence before any production-readiness claim.
