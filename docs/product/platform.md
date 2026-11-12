# 06 - Architecture, Storage & Integration

## Selected architecture and evidence status

| Concern               | Selected or preferred direction                                                                                  | Evidence / remaining work                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Client / app host     | **Next.js mobile-first PWA on Vercel**                                                                           | Vercel deployment demonstrated in #3                          |
| D1 access boundary    | **Authenticated Cloudflare Worker** called by Vercel Node                                                        | Remote path demonstrated in #5; hardening separate            |
| Background scheduling | **Cloudflare Cron Triggers / Worker**, or approved authenticated [cron-job.org](http://cron-job.org) alternative | Reliability validation still required                         |
| Durable persistence   | **Cloudflare D1 with Drizzle ORM** via Worker                                                                    | Remote migration, atomic writes and claims demonstrated in #5 |
| Push                  | **Firebase Cloud Messaging** preferred                                                                           | Real iPhone Home Screen PWA proof still blocked by #6         |
| Medication catalog    | Indexed D1 catalog tables separate from user records                                                             | Data licensing and coverage unresolved                        |
| Cache                 | **No Redis by default**                                                                                          | Add only on measured need                                     |
| Database alternatives | **Neon/PostgreSQL** acceptable conditional fallback; Convex not selected                                         | No D1 blocker currently warrants fallback                     |

The D1 decision prioritizes a cost-conscious, low-operations setup for a very small initial audience while preserving production engineering practices. **Neon inactivity behavior was a concern** and Convex was considered more BaaS than needed.

## Frontend streaming, Query and session contract - approved November 6, 2026

#82 approved streamed, server-prefetched sections that hydrate TanStack Query, which owns browser data for the session. What the user sees: the [session contract](./ux-journeys.md#session-contract) in topic 02. How it is built: [Next.js](../nextjs.md) and [client state](../client-state.md).

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
- Online writes and in-memory session recovery follow the topic 02 [session contract](./ux-journeys.md#session-contract).

## Feasibility evidence and remaining gates

| Evidence | Established boundary                                                                                                                          | Still not established                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| #3       | Isolated Next.js/Vercel deployment and measured sample request limits                                                                         | Sustained throughput, complete production readiness                                        |
| #4       | Google allowlist/session lifecycle tested in a narrow deployment, with user-observed real-account checks                                      | Final production revocation/ownership policies                                             |
| #5       | Vercel to authenticated Worker to D1/Drizzle, remote migration, atomic stock/intake rollback, idempotency and competing reminder-claim leases | Full production schema and capacity, provider delivery guarantees                          |
| #7       | Synthetic encrypted D1 → private R2 → isolated D1 restore and independent key-recovery round trip                                             | Automated daily schedule, independent key custody, live restore and deleted-account safety |
| #6       | **Not completed**                                                                                                                             | Installed/closed/locked real-iPhone FCM delivery, token lifecycle and deep links           |

Keep shared application behavior independent of invocation transport; avoid generic multi-provider frameworks without a measured need. Standard Web Push, Neon/PostgreSQL and an authenticated external scheduler are conditional fallbacks, not parallel MVP deployments.

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
